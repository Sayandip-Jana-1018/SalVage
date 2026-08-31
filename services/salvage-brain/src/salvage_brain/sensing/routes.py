"""FastAPI route handlers for real-time rail health sensing."""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from salvage_brain.auth import operator_scope
from salvage_brain.sensing.models import RailState
from salvage_brain.sensing.tracker import default_rail_tracker

router = APIRouter(prefix="/v1/sensing", tags=["sensing"])


class RailHealthView(BaseModel):
    """Point-in-time health metrics view for an individual payment rail."""

    rail_id: str
    state: RailState
    success_rate_5m: float = Field(..., ge=0.0, le=1.0)
    failure_velocity_5m: float
    last_evaluated_at: dt.datetime


class RailHealthMatrix(BaseModel):
    """Active matrix of all monitored payment rails."""

    timestamp: dt.datetime
    rails: list[RailHealthView]


@router.get(
    "/rails",
    response_model=RailHealthMatrix,
    responses={
        200: {"description": "Active rail health matrix"},
        403: {"description": "A merchant-scoped key cannot read a cross-tenant aggregate"},
    },
    dependencies=[Depends(operator_scope("The rail health matrix"))],
)
def get_rail_health_matrix() -> RailHealthMatrix:
    """Real-time health across every active rail, aggregated over all tenants.

    Operator scope only, and that is a real restriction rather than caution.
    This matrix is built from every merchant's ingested traffic, so serving it
    to a merchant key would hand one tenant a view of another's failure
    patterns -- volume, issuer mix and timing -- which is competitive
    information they did not consent to share. A per-tenant view is ADR-0007
    work and does not exist, so the honest answer is to refuse rather than to
    serve the aggregate and hope nobody reads it closely.
    """
    now = dt.datetime.now(dt.UTC)
    snapshots = default_rail_tracker.get_all_snapshots(now)
    views = [
        RailHealthView(
            rail_id=s.rail_id,
            state=s.state,
            success_rate_5m=round(s.success_rate_5m, 4),
            failure_velocity_5m=round(s.failure_velocity_5m, 4),
            last_evaluated_at=s.last_evaluated_at,
        )
        for s in snapshots
    ]
    return RailHealthMatrix(timestamp=now, rails=views)
