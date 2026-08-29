"""Health endpoints for salvage-brain.

Liveness: is the process alive?
Readiness: can it reach PostgreSQL, Redis, and Kafka?

A health check that doesn't touch the wire isn't a health check.
"""

from __future__ import annotations

import time
from typing import Any

import redis
from confluent_kafka.admin import AdminClient
from fastapi import APIRouter, Response
from sqlalchemy import text

from salvage_brain.config import settings
from salvage_brain.database import engine

router = APIRouter(prefix="/healthz", tags=["health"])


def _check_postgres() -> dict[str, Any]:
    start = time.monotonic()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            conn.commit()
        latency_ms = (time.monotonic() - start) * 1000
        return {"status": "up", "latency_ms": round(latency_ms, 2)}
    except Exception as exc:
        return {"status": "down", "error": str(exc)}


def _check_redis() -> dict[str, Any]:
    start = time.monotonic()
    try:
        r = redis.Redis(host=settings.redis_host, port=settings.redis_port, socket_timeout=3)
        pong = r.ping()
        latency_ms = (time.monotonic() - start) * 1000
        if pong:
            return {"status": "up", "latency_ms": round(latency_ms, 2)}
        return {"status": "down", "error": "ping returned False"}
    except Exception as exc:
        return {"status": "down", "error": str(exc)}


def _check_kafka() -> dict[str, Any]:
    start = time.monotonic()
    try:
        admin = AdminClient({"bootstrap.servers": settings.kafka_bootstrap_servers})
        admin.list_topics(timeout=5)
        latency_ms = (time.monotonic() - start) * 1000
        return {"status": "up", "latency_ms": round(latency_ms, 2)}
    except Exception as exc:
        return {"status": "down", "error": str(exc)}


@router.get("/liveness")
async def liveness() -> dict[str, Any]:
    return {"status": "healthy", "checks": {}}


@router.get("/readiness")
async def readiness(response: Response) -> dict[str, Any]:
    checks = {
        "postgres": _check_postgres(),
        "redis": _check_redis(),
        "kafka": _check_kafka(),
    }
    all_up = all(c["status"] == "up" for c in checks.values())
    if not all_up:
        response.status_code = 503

    return {"status": "healthy" if all_up else "unhealthy", "checks": checks}
