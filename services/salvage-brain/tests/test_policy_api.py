"""Integration tests for the /v1/decide policy API endpoint."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy
from fastapi.testclient import TestClient
from sqlalchemy import text

_REPO_ROOT = Path(__file__).resolve().parents[3]
_EXTENSIONS_SQL = _REPO_ROOT / "ops" / "postgres" / "init" / "01-extensions.sql"
_V1_SQL = (
    _REPO_ROOT
    / "services"
    / "salvage-core"
    / "src"
    / "main"
    / "resources"
    / "db"
    / "migration"
    / "V1__baseline.sql"
)
_V2_SQL = (
    _REPO_ROOT
    / "services"
    / "salvage-core"
    / "src"
    / "main"
    / "resources"
    / "db"
    / "migration"
    / "V2__money_core.sql"
)
_V3_SQL = (
    _REPO_ROOT
    / "services"
    / "salvage-core"
    / "src"
    / "main"
    / "resources"
    / "db"
    / "migration"
    / "V3__recovery_decisions.sql"
)

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def postgres_url() -> Iterator[str]:
    from testcontainers.postgres import PostgresContainer  # type: ignore[import-untyped]

    with PostgresContainer(
        "timescale/timescaledb:2.29.2-pg16",
        username="salvage",
        password="salvage_test",
        dbname="salvage_test",
        driver="psycopg",
    ) as container:
        url = container.get_connection_url()
        engine = sqlalchemy.create_engine(url)
        with engine.begin() as conn:
            conn.execute(text(_EXTENSIONS_SQL.read_text(encoding="utf-8")))
        with engine.begin() as conn:
            conn.execute(text("SET search_path TO salvage, public"))
            conn.execute(text(_V1_SQL.read_text(encoding="utf-8")))
            conn.execute(text(_V2_SQL.read_text(encoding="utf-8")))
            conn.execute(text(_V3_SQL.read_text(encoding="utf-8")))
        engine.dispose()
        yield url


@pytest.fixture
def client(postgres_url: str, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("SALVAGE_DATABASE_URL", postgres_url)

    from salvage_brain import database

    database.engine.dispose()
    database.engine = sqlalchemy.create_engine(postgres_url)

    from salvage_brain.main import create_app

    return TestClient(create_app())


def test_decide_endpoint_returns_optimal_action(client: TestClient, postgres_url: str) -> None:
    merchant_id = f"m_{uuid.uuid4().hex[:8]}"
    attempt_id = f"att_{uuid.uuid4().hex[:8]}"
    attempt_uuid = uuid.uuid4()
    order_id = f"ord_{uuid.uuid4().hex[:8]}"
    now = dt.datetime.now(dt.UTC)

    engine = sqlalchemy.create_engine(postgres_url)
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO salvage.merchants (merchant_id, name) VALUES (:id, :name)"),
            {"id": merchant_id, "name": "Policy API Test Merchant"},
        )
        conn.execute(
            text(
                """
                INSERT INTO salvage.payment_attempts
                    (id, merchant_id, order_id, payment_attempt_id, customer_id,
                     amount_paise, currency, payment_method, provider, issuer,
                     is_recurring, raw_event, created_at)
                VALUES
                    (:id, :m_id, :ord_id, :att_id, :cust_id,
                     :amount, 'INR', 'upi', 'razorpay', 'issuer_alpha',
                     true, '{}'::jsonb, :created_at)
                """
            ),
            {
                "id": attempt_uuid,
                "m_id": merchant_id,
                "ord_id": order_id,
                "att_id": attempt_id,
                "cust_id": "cust_pol_1",
                "amount": 250000,
                "created_at": now,
            },
        )
        conn.execute(
            text(
                """
                INSERT INTO salvage.failure_events
                    (id, merchant_id, event_id, payment_attempt_id,
                     provider_error_code, provider_error_desc, rail_id, event_timestamp)
                VALUES
                    (:id, :m_id, :evt_id, :att_uuid,
                     'TIMED_OUT', 'Gateway timeout on NPCI switch',
                     'issuer_alpha|UPI|RAZORPAY', :ts)
                """
            ),
            {
                "id": uuid.uuid4(),
                "m_id": merchant_id,
                "evt_id": uuid.uuid4(),
                "att_uuid": attempt_uuid,
                "ts": now,
            },
        )
    engine.dispose()

    response = client.post(
        "/v1/decide",
        json={"merchant_id": merchant_id, "payment_attempt_id": attempt_id},
    )
    assert response.status_code == 200
    decision = response.json()

    assert decision["payment_attempt_id"] == attempt_id
    assert decision["chosen_action"] in ("RETRY_IMMEDIATE", "RETRY_SCHEDULED", "SWITCH_RAIL")
    assert decision["recovery_probability"] >= 0.70
    assert decision["expected_net_value_paise"] > 0
    assert len(decision["reasoning_tokens"]) > 0

    # Four candidates, not five. This fixture ingests traffic on one rail
    # only, so the sensing tracker has observed no healthy alternative and
    # SWITCH_RAIL is not an available action -- it is absent from the ranking
    # rather than listed at zero, because it was never a candidate the
    # optimiser compared. The reasoning tokens say so.
    actions = {valuation["action"] for valuation in decision["candidate_valuations"]}
    assert actions == {
        "RETRY_IMMEDIATE",
        "RETRY_SCHEDULED",
        "CUSTOMER_NUDGE",
        "NO_ACTION",
    }
    assert "SWITCH_RAIL_UNAVAILABLE_NO_HEALTHY_ALTERNATIVE" in decision["reasoning_tokens"]


def test_decide_unknown_attempt_returns_404(client: TestClient) -> None:
    response = client.post(
        "/v1/decide",
        json={"merchant_id": "non_existent_m", "payment_attempt_id": "non_existent_att"},
    )
    assert response.status_code == 404
