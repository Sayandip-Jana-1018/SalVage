"""Integration test for the attempt read path.

Runs against a real PostgreSQL container using the same TimescaleDB image the
compose stack runs, and the same schema files: the extension bootstrap from
``ops/postgres/init`` and the Flyway baseline from salvage-core. Nothing is
re-declared here, so this test fails if the migration and the read path drift
apart -- which is the failure it exists to catch.

The previous version of this module claimed in its docstring to contain "an
integration marker for the full Testcontainers test", and contained no such
test. This is that test.
"""

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
_BASELINE_SQL = (
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

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def postgres_url() -> Iterator[str]:
    from testcontainers.postgres import PostgresContainer

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
            conn.execute(text(_BASELINE_SQL.read_text(encoding="utf-8")))
        engine.dispose()
        yield url


@pytest.fixture
def client(postgres_url: str, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """Point the application's engine at the container before importing routes."""
    import salvage_brain.attempts as attempts_module
    import salvage_brain.database as database_module

    engine = sqlalchemy.create_engine(
        postgres_url, connect_args={"options": "-c search_path=salvage,public"}
    )
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(attempts_module, "engine", engine)

    from salvage_brain.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client
    engine.dispose()


def _seed(url: str, merchant_id: str, attempt_id: str, event_id: uuid.UUID) -> None:
    engine = sqlalchemy.create_engine(
        url, connect_args={"options": "-c search_path=salvage,public"}
    )
    with engine.begin() as conn:
        conn.execute(
            text("INSERT INTO merchants (merchant_id, name) VALUES (:m, :n) "
                 "ON CONFLICT DO NOTHING"),
            {"m": merchant_id, "n": "Test Merchant"},
        )
        attempt_uuid = conn.execute(
            text(
                "INSERT INTO payment_attempts "
                "(merchant_id, order_id, payment_attempt_id, amount_paise, currency, "
                " payment_method, provider, issuer, is_recurring, raw_event) "
                "VALUES (:m, :o, :p, 249900, 'INR', 'upi', 'razorpay', 'HDFC', false, "
                "        '{}'::jsonb) RETURNING id"
            ),
            {"m": merchant_id, "o": "order_1", "p": attempt_id},
        ).scalar_one()
        conn.execute(
            text(
                "INSERT INTO failure_events "
                "(merchant_id, event_id, payment_attempt_id, provider_error_code, "
                " rail_id, event_timestamp) "
                "VALUES (:m, :e, :a, 'BAD_REQUEST_ERROR', 'HDFC|upi|razorpay', :ts)"
            ),
            {
                "m": merchant_id,
                "e": str(event_id),
                "a": attempt_uuid,
                "ts": dt.datetime(2026, 8, 29, 10, 15, 30, tzinfo=dt.UTC),
            },
        )
    engine.dispose()


def test_readiness_reports_postgres_up_against_a_real_database(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, postgres_url: str
) -> None:
    """Only the PostgreSQL probe is exercised; Redis and Kafka have their own."""
    from salvage_brain import probes

    engine = sqlalchemy.create_engine(postgres_url)
    monkeypatch.setattr(probes, "engine", engine)

    class PgProbe:
        name = "postgres"

        def check(self) -> None:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))

    monkeypatch.setattr(probes, "PROBES", (PgProbe(),))

    response = client.get("/healthz/readiness")

    assert response.status_code == 200
    assert response.json()["checks"]["postgres"]["status"] == "up"
    engine.dispose()


def test_an_ingested_attempt_is_readable_with_its_failures(
    client: TestClient, postgres_url: str
) -> None:
    merchant_id = "merch_read_1"
    attempt_id = "pay_read_1"
    event_id = uuid.uuid4()
    _seed(postgres_url, merchant_id, attempt_id, event_id)

    response = client.get(f"/v1/attempts/{merchant_id}/{attempt_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["amount_paise"] == 249900
    assert body["issuer"] == "HDFC"
    assert body["payment_method"] == "upi"
    assert len(body["failures"]) == 1
    assert body["failures"][0]["rail_id"] == "HDFC|upi|razorpay"
    # Phase 3 owns the taxonomy; nothing has classified this yet.
    assert body["failures"][0]["taxonomy_code"] is None


def test_a_missing_attempt_is_404(client: TestClient) -> None:
    response = client.get("/v1/attempts/merch_read_1/pay_does_not_exist")
    assert response.status_code == 404


def test_an_attempt_is_not_readable_through_another_merchants_id(
    client: TestClient, postgres_url: str
) -> None:
    """Tenant scoping is in the query, not left to the caller to remember."""
    merchant_id = "merch_read_2"
    attempt_id = "pay_read_2"
    _seed(postgres_url, merchant_id, attempt_id, uuid.uuid4())

    assert client.get(f"/v1/attempts/{merchant_id}/{attempt_id}").status_code == 200
    assert client.get(f"/v1/attempts/merch_intruder/{attempt_id}").status_code == 404
