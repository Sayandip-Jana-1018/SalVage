"""Integration tests for the diagnosis and sensing FastAPI endpoints."""

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


def test_sensing_rails_endpoint_returns_200_and_active_matrix(client: TestClient) -> None:
    response = client.get("/v1/sensing/rails")
    assert response.status_code == 200
    data = response.json()
    assert "timestamp" in data
    assert "rails" in data
    assert len(data["rails"]) > 0
    assert any(r["rail_id"] == "HDFC|UPI|RAZORPAY" for r in data["rails"])


def test_diagnose_endpoint_returns_structured_response(
    client: TestClient, postgres_url: str
) -> None:
    merchant_id = f"m_{uuid.uuid4().hex[:8]}"
    attempt_id = f"att_{uuid.uuid4().hex[:8]}"
    attempt_uuid = uuid.uuid4()
    order_id = f"ord_{uuid.uuid4().hex[:8]}"
    now = dt.datetime.now(dt.UTC)

    engine = sqlalchemy.create_engine(postgres_url)
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO salvage.merchants (merchant_id, name) VALUES (:id, :name)"),
            {"id": merchant_id, "name": "Diagnosis Test Merchant"},
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
                     :amount, 'INR', 'upi', 'razorpay', 'HDFC',
                     true, '{}'::jsonb, :created_at)
                """
            ),
            {
                "id": attempt_uuid,
                "m_id": merchant_id,
                "ord_id": order_id,
                "att_id": attempt_id,
                "cust_id": "cust_diag_1",
                "amount": 100000,
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
                     'U30', 'Insufficient funds in account', 'HDFC|UPI|RAZORPAY', :ts)
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

    # Call POST /v1/diagnose
    payload = {
        "merchant_id": merchant_id,
        "payment_attempt_id": attempt_id,
    }
    response = client.post("/v1/diagnose", json=payload)
    assert response.status_code == 200
    diag = response.json()

    assert diag["payment_attempt_id"] == attempt_id
    assert diag["taxonomy_code"] == "INSUFFICIENT_FUNDS"
    assert diag["confidence"] >= 0.90
    assert diag["rail_id"] == "HDFC|UPI|RAZORPAY"
    assert diag["suggested_action"] in ("RETRY_SMART_SCHEDULE", "CUSTOMER_NUDGE")
    assert len(diag["explainability_tokens"]) > 0


def test_diagnose_unknown_attempt_returns_404(client: TestClient) -> None:
    response = client.post(
        "/v1/diagnose",
        json={"merchant_id": "non_existent_m", "payment_attempt_id": "non_existent_att"},
    )
    assert response.status_code == 404
