"""Infrastructure dependency probes.

Each probe does a real round trip. A probe that inspects configuration rather
than touching the wire reports health it has not verified, which is worse than
no probe at all because it is trusted.

Clients are module-level singletons. Creating a Redis client or a Kafka
``AdminClient`` per request opens a connection and, for Kafka, starts a
background thread; with a container health check polling every few seconds
that is a steady leak of both.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Protocol

import redis
from confluent_kafka.admin import AdminClient
from sqlalchemy import text

from salvage_brain.config import settings
from salvage_brain.database import engine

log = logging.getLogger(__name__)


class Probe(Protocol):
    """One dependency that can be round-tripped.

    ``name`` is declared as a read-only property rather than a bare attribute.
    A mutable protocol attribute is invariant, which would make every frozen
    implementation below structurally incompatible.
    """

    @property
    def name(self) -> str: ...

    def check(self) -> None:
        """Return normally if reachable; raise otherwise."""


@dataclass(frozen=True)
class PostgresProbe:
    name: str = "postgres"

    def check(self) -> None:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))


@dataclass(frozen=True)
class RedisProbe:
    name: str = "redis"

    def check(self) -> None:
        if not _redis_client().ping():
            raise RuntimeError("PING returned a falsy response")


@dataclass(frozen=True)
class KafkaProbe:
    name: str = "kafka"

    def check(self) -> None:
        _kafka_admin().list_topics(timeout=settings.kafka_timeout_seconds)


_redis_singleton: redis.Redis | None = None
_kafka_singleton: AdminClient | None = None


def _redis_client() -> redis.Redis:
    global _redis_singleton
    if _redis_singleton is None:
        _redis_singleton = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            socket_timeout=settings.redis_timeout_seconds,
            socket_connect_timeout=settings.redis_timeout_seconds,
        )
    return _redis_singleton


def _kafka_admin() -> AdminClient:
    global _kafka_singleton
    if _kafka_singleton is None:
        _kafka_singleton = AdminClient(
            {
                "bootstrap.servers": settings.kafka_bootstrap_servers,
                "socket.timeout.ms": int(settings.kafka_timeout_seconds * 1000),
            }
        )
    return _kafka_singleton


PROBES: tuple[Probe, ...] = (PostgresProbe(), RedisProbe(), KafkaProbe())


def run(probe: Probe) -> dict[str, Any]:
    """Run one probe and render its result.

    The result carries the exception *type* and never its message. The health
    endpoint is unauthenticated, and SQLAlchemy and driver errors routinely
    embed the connection URL, which embeds the password. Full detail goes to
    the log, where it is useful and not publicly readable.
    """
    start = time.monotonic()
    try:
        probe.check()
    except Exception as exc:
        log.warning("Readiness probe %r failed", probe.name, exc_info=exc)
        return {
            "status": "down",
            "latency_ms": _elapsed_ms(start),
            "reason": type(exc).__name__,
        }
    return {"status": "up", "latency_ms": _elapsed_ms(start)}


def _elapsed_ms(start: float) -> float:
    """``time.monotonic`` cannot step backwards across an NTP correction."""
    return round((time.monotonic() - start) * 1000, 2)
