"""Read access to ingested payment attempts.

This is the first slice of the read path that the Phase 3 feature store is
built on: salvage-brain reads facts that salvage-core wrote, and never writes
to them. The write side stays entirely in salvage-core, which is what keeps
the "brain never moves money" boundary checkable rather than aspirational.

Every query is scoped by ``merchant_id``. There is deliberately no endpoint
that returns attempts across tenants.
"""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from salvage_brain.database import engine

router = APIRouter(prefix="/v1/attempts", tags=["attempts"])


class FailureSummary(BaseModel):
    """One failure observed on an attempt."""

    event_id: str
    provider_error_code: str
    rail_id: str
    event_timestamp: dt.datetime
    taxonomy_code: str | None = Field(
        default=None,
        description="Null until the Phase 3 taxonomy classifies this failure.",
    )


class AttemptView(BaseModel):
    """A payment attempt as the decision service sees it."""

    merchant_id: str
    order_id: str
    payment_attempt_id: str
    amount_paise: int
    currency: str
    payment_method: str
    provider: str
    issuer: str
    is_recurring: bool
    created_at: dt.datetime
    failures: list[FailureSummary]


_ATTEMPT_SQL = text(
    """
    SELECT id, merchant_id, order_id, payment_attempt_id, amount_paise,
           currency, payment_method, provider, issuer, is_recurring, created_at
      FROM salvage.payment_attempts
     WHERE merchant_id = :merchant_id
       AND payment_attempt_id = :payment_attempt_id
    """
)

_FAILURES_SQL = text(
    """
    SELECT event_id, provider_error_code, rail_id, event_timestamp, taxonomy_code
      FROM salvage.failure_events
     WHERE merchant_id = :merchant_id
       AND payment_attempt_id = :payment_attempt_id
     ORDER BY event_timestamp ASC
    """
)


@router.get(
    "/{merchant_id}/{payment_attempt_id}",
    response_model=AttemptView,
    responses={404: {"description": "No such attempt for this merchant"}},
)
def get_attempt(merchant_id: str, payment_attempt_id: str) -> AttemptView:
    with engine.connect() as conn:
        row = conn.execute(
            _ATTEMPT_SQL,
            {"merchant_id": merchant_id, "payment_attempt_id": payment_attempt_id},
        ).mappings().first()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No such attempt for this merchant",
            )

        failures = conn.execute(
            _FAILURES_SQL,
            {"merchant_id": merchant_id, "payment_attempt_id": row["id"]},
        ).mappings().all()

    return AttemptView(
        merchant_id=row["merchant_id"],
        order_id=row["order_id"],
        payment_attempt_id=row["payment_attempt_id"],
        amount_paise=row["amount_paise"],
        currency=row["currency"],
        payment_method=row["payment_method"],
        provider=row["provider"],
        issuer=row["issuer"],
        is_recurring=row["is_recurring"],
        created_at=row["created_at"],
        failures=[
            FailureSummary(
                event_id=str(f["event_id"]),
                provider_error_code=f["provider_error_code"],
                rail_id=f["rail_id"],
                event_timestamp=f["event_timestamp"],
                taxonomy_code=f["taxonomy_code"],
            )
            for f in failures
        ],
    )
