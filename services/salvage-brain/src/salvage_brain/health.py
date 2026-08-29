"""Health endpoints for salvage-brain.

Liveness: is the process alive?
Readiness: can it reach PostgreSQL, Redis, and Kafka?

A health check that doesn't touch the wire isn't a health check.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Response

from salvage_brain import probes

router = APIRouter(prefix="/healthz", tags=["health"])


@router.get("/liveness")
def liveness() -> dict[str, Any]:
    """Deliberately touches nothing downstream."""
    return {"status": "healthy", "checks": {}}


@router.get(
    "/readiness",
    # Declared explicitly because the 503 is set imperatively below. FastAPI
    # only documents status codes it can infer, so without this the served
    # OpenAPI would silently omit the failure case that
    # contracts/openapi/brain.v1.yaml promises -- which is exactly the drift
    # scripts/check_contracts.py exists to catch.
    responses={503: {"description": "Not ready - at least one dependency unreachable"}},
)
def readiness(response: Response) -> dict[str, Any]:
    """Round-trips every dependency.

    Declared ``def`` rather than ``async def`` on purpose. Every probe does
    blocking socket I/O; on an ``async def`` route that runs directly on the
    event loop and stalls the entire process for up to the sum of the probe
    timeouts. A plain ``def`` route is dispatched to FastAPI's threadpool, so
    a hung dependency degrades this one request instead of the whole service.
    """
    checks = {probe.name: probes.run(probe) for probe in probes.PROBES}
    all_up = all(check["status"] == "up" for check in checks.values())
    if not all_up:
        response.status_code = 503
    return {"status": "healthy" if all_up else "unhealthy", "checks": checks}
