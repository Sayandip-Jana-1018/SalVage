"""Unit tests for the readiness aggregation logic.

These use hand-written fake probes rather than patching the private check
functions. Patching module privates couples the test to the implementation's
shape; swapping the probe tuple exercises the same seam the production code
uses and survives refactoring.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from salvage_brain import probes
from salvage_brain.main import create_app


class FakeProbe:
    def __init__(self, name: str, failure: Exception | None = None) -> None:
        self.name = name
        self._failure = failure

    def check(self) -> None:
        if self._failure is not None:
            raise self._failure


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def test_liveness_returns_200_and_touches_nothing(client: TestClient) -> None:
    response = client.get("/healthz/liveness")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_readiness_healthy_when_all_probes_succeed(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        probes, "PROBES", (FakeProbe("postgres"), FakeProbe("redis"), FakeProbe("kafka"))
    )

    response = client.get("/healthz/readiness")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert set(body["checks"]) == {"postgres", "redis", "kafka"}
    assert all(c["status"] == "up" for c in body["checks"].values())


@pytest.mark.parametrize("failing", ["postgres", "redis", "kafka"])
def test_readiness_is_503_when_any_single_probe_fails(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, failing: str
) -> None:
    built = tuple(
        FakeProbe(name, ConnectionError("refused") if name == failing else None)
        for name in ("postgres", "redis", "kafka")
    )
    monkeypatch.setattr(probes, "PROBES", built)

    response = client.get("/healthz/readiness")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "unhealthy"
    assert body["checks"][failing]["status"] == "down"


def test_readiness_reports_every_failing_probe_not_just_the_first(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        probes,
        "PROBES",
        (
            FakeProbe("postgres", ConnectionError("a")),
            FakeProbe("redis", ConnectionError("b")),
            FakeProbe("kafka"),
        ),
    )

    body = client.get("/healthz/readiness").json()

    assert body["checks"]["postgres"]["status"] == "down"
    assert body["checks"]["redis"]["status"] == "down"
    assert body["checks"]["kafka"]["status"] == "up"


def test_readiness_never_leaks_exception_messages(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The endpoint is unauthenticated.

    SQLAlchemy and driver errors routinely embed the connection URL, which
    embeds the password. Only the exception type may cross the boundary.
    """
    secret = "postgresql://salvage:hunter2@db:5432/salvage"
    monkeypatch.setattr(probes, "PROBES", (FakeProbe("postgres", ConnectionError(secret)),))

    response = client.get("/healthz/readiness")

    assert "hunter2" not in response.text
    assert "postgresql://" not in response.text
    assert response.json()["checks"]["postgres"]["reason"] == "ConnectionError"


def test_readiness_reports_non_negative_latency(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(probes, "PROBES", (FakeProbe("postgres"),))

    body = client.get("/healthz/readiness").json()

    assert body["checks"]["postgres"]["latency_ms"] >= 0
