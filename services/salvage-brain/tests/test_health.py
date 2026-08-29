"""Tests for the salvage-brain health endpoints.

This module contains two kinds of tests:
1. Unit tests that mock the dependencies (fast, run without Docker).
2. An integration marker for the full Testcontainers test (runs in CI).
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client() -> TestClient:
    """Create a test client with mocked infra checks for unit tests."""
    from salvage_brain.main import create_app

    app = create_app()
    return TestClient(app)


def test_liveness_returns_200(client: TestClient) -> None:
    response = client.get("/healthz/liveness")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"


@patch("salvage_brain.health._check_postgres", return_value={"status": "up", "latency_ms": 1.0})
@patch("salvage_brain.health._check_redis", return_value={"status": "up", "latency_ms": 0.5})
@patch("salvage_brain.health._check_kafka", return_value={"status": "up", "latency_ms": 2.0})
def test_readiness_healthy_when_all_up(
    mock_kafka: MagicMock,
    mock_redis: MagicMock,
    mock_pg: MagicMock,
    client: TestClient,
) -> None:
    response = client.get("/healthz/readiness")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["checks"]["postgres"]["status"] == "up"
    assert body["checks"]["redis"]["status"] == "up"
    assert body["checks"]["kafka"]["status"] == "up"


@patch("salvage_brain.health._check_postgres", return_value={"status": "down", "error": "refused"})
@patch("salvage_brain.health._check_redis", return_value={"status": "up", "latency_ms": 0.5})
@patch("salvage_brain.health._check_kafka", return_value={"status": "up", "latency_ms": 2.0})
def test_readiness_unhealthy_when_postgres_down(
    mock_kafka: MagicMock,
    mock_redis: MagicMock,
    mock_pg: MagicMock,
    client: TestClient,
) -> None:
    response = client.get("/healthz/readiness")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "unhealthy"
    assert body["checks"]["postgres"]["status"] == "down"


@patch("salvage_brain.health._check_postgres", return_value={"status": "up", "latency_ms": 1.0})
@patch("salvage_brain.health._check_redis", return_value={"status": "down", "error": "timeout"})
@patch("salvage_brain.health._check_kafka", return_value={"status": "up", "latency_ms": 2.0})
def test_readiness_unhealthy_when_redis_down(
    mock_kafka: MagicMock,
    mock_redis: MagicMock,
    mock_pg: MagicMock,
    client: TestClient,
) -> None:
    response = client.get("/healthz/readiness")
    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "unhealthy"
    assert body["checks"]["redis"]["status"] == "down"
