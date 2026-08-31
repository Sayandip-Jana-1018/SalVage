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
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text

import salvage_brain.database as database
from salvage_brain.auth import Principal, authenticate, require_tenant

router = APIRouter(prefix="/v1/attempts", tags=["attempts"])


class FailureSummary(BaseModel):
    """One failure observed on an attempt."""

    event_id: str
    provider_error_code: str
    rail_id: str
    event_timestamp: dt.datetime
    taxonomy_code: str | None = Field(
        default=None,
        description="Standardized taxonomy classification.",
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


class AttemptSummary(BaseModel):
    """One attempt in a listing: enough to identify and choose it, no more."""

    merchant_id: str
    payment_attempt_id: str
    order_id: str
    amount_paise: int
    currency: str
    payment_method: str
    issuer: str
    created_at: dt.datetime
    failure_count: int


class AttemptPage(BaseModel):
    """A bounded page of attempts for one tenant."""

    merchant_id: str
    limit: int
    attempts: list[AttemptSummary]


_LIST_SQL = text(
    """
    SELECT a.merchant_id, a.payment_attempt_id, a.order_id, a.amount_paise,
           a.currency, a.payment_method, a.issuer, a.created_at,
           count(f.event_id) AS failure_count
      FROM salvage.payment_attempts a
      LEFT JOIN salvage.failure_events f
             ON f.payment_attempt_id = a.id
            AND f.merchant_id = a.merchant_id
     WHERE a.merchant_id = :merchant_id
     GROUP BY a.merchant_id, a.payment_attempt_id, a.order_id, a.amount_paise,
              a.currency, a.payment_method, a.issuer, a.created_at, a.id
     ORDER BY a.created_at DESC
     LIMIT :limit
    """
)

MAX_LIST_LIMIT = 200


@router.get(
    "/{merchant_id}",
    response_model=AttemptPage,
    responses={422: {"description": "limit out of range"}},
)
def list_attempts(
    merchant_id: str,
    principal: Annotated[Principal, Depends(authenticate)],
    limit: int = 50,
) -> AttemptPage:
    """Most recent attempts for one tenant, newest first.

    Bounded and tenant-scoped, like every other read here. There is no
    cross-tenant listing and no unbounded one: this is called from an operator
    console page load and from the load harness, and an audit table grows
    without limit.

    The limit is rejected rather than clamped when out of range. Clamping
    would answer a different question than the caller asked and label the
    result with the limit they requested.
    """
    require_tenant(merchant_id, principal)
    if limit < 1 or limit > MAX_LIST_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"limit must be between 1 and {MAX_LIST_LIMIT}, got {limit}",
        )

    with database.engine.connect() as conn:
        rows = (
            conn.execute(_LIST_SQL, {"merchant_id": merchant_id, "limit": limit})
            .mappings()
            .all()
        )

    return AttemptPage(
        merchant_id=merchant_id,
        limit=limit,
        attempts=[
            AttemptSummary(
                merchant_id=row["merchant_id"],
                payment_attempt_id=row["payment_attempt_id"],
                order_id=row["order_id"],
                amount_paise=row["amount_paise"],
                currency=row["currency"],
                payment_method=row["payment_method"],
                issuer=row["issuer"],
                created_at=row["created_at"],
                failure_count=int(row["failure_count"]),
            )
            for row in rows
        ],
    )


@router.get(
    "/{merchant_id}/{payment_attempt_id}",
    response_model=AttemptView,
    responses={404: {"description": "No such attempt for this merchant"}},
)
def get_attempt(
    merchant_id: str,
    payment_attempt_id: str,
    principal: Annotated[Principal, Depends(authenticate)],
) -> AttemptView:
    require_tenant(merchant_id, principal)
    with database.engine.connect() as conn:
        row = (
            conn.execute(
                _ATTEMPT_SQL,
                {"merchant_id": merchant_id, "payment_attempt_id": payment_attempt_id},
            )
            .mappings()
            .first()
        )

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No such attempt for this merchant",
            )

        failures = (
            conn.execute(
                _FAILURES_SQL,
                {"merchant_id": merchant_id, "payment_attempt_id": row["id"]},
            )
            .mappings()
            .all()
        )

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
