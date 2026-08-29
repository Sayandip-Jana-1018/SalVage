"""Data transfer models for the Salvage Diagnosis Engine."""

from __future__ import annotations

import datetime as dt
from enum import StrEnum

from pydantic import BaseModel, Field

from salvage_brain.taxonomy.codes import TaxonomyCode


class SuggestedAction(StrEnum):
    """High-level action recommended by the diagnosis engine."""

    RETRY_IMMEDIATE = "RETRY_IMMEDIATE"
    RETRY_SMART_SCHEDULE = "RETRY_SMART_SCHEDULE"
    SWITCH_RAIL = "SWITCH_RAIL"
    CUSTOMER_NUDGE = "CUSTOMER_NUDGE"
    NO_ACTION = "NO_ACTION"


class DiagnosisRequest(BaseModel):
    """Request payload to diagnose a payment failure."""

    merchant_id: str = Field(..., description="Tenant identifier")
    payment_attempt_id: str = Field(..., description="Payment attempt identifier")
    observation_timestamp: dt.datetime | None = Field(
        default=None,
        description="Point-in-time reference for historical backtesting and evaluation",
    )


class DiagnosisResponse(BaseModel):
    """Structured diagnostic assessment and reasoning produced by salvage-brain."""

    payment_attempt_id: str
    taxonomy_code: TaxonomyCode
    confidence: float = Field(..., ge=0.0, le=1.0)
    root_cause: str
    rail_id: str
    rail_state: str
    explainability_tokens: list[str]
    suggested_action: SuggestedAction
    diagnosed_at: dt.datetime
