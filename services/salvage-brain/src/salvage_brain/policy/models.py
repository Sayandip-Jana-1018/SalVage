"""Data transfer and domain models for the Salvage Policy Engine."""

from __future__ import annotations

import datetime as dt
from enum import StrEnum

from pydantic import BaseModel, Field


class RecoveryActionType(StrEnum):
    """The bounded action space available to the policy engine."""

    RETRY_IMMEDIATE = "RETRY_IMMEDIATE"
    RETRY_SCHEDULED = "RETRY_SCHEDULED"
    SWITCH_RAIL = "SWITCH_RAIL"
    CUSTOMER_NUDGE = "CUSTOMER_NUDGE"
    NO_ACTION = "NO_ACTION"


class CommunicationChannel(StrEnum):
    """Supported customer communication channels for recovery nudges."""

    WHATSAPP = "WHATSAPP"
    SMS = "SMS"
    EMAIL = "EMAIL"


class ActionValuation(BaseModel):
    """Economic valuation and expected return of a candidate recovery action."""

    action: RecoveryActionType
    recovery_probability: float = Field(..., ge=0.0, le=1.0)
    gross_expected_value_paise: int
    estimated_cost_paise: int
    net_expected_value_paise: int


class PolicyDecisionRequest(BaseModel):
    """Request payload to compute an optimal recovery policy decision."""

    merchant_id: str = Field(..., description="Tenant identifier")
    payment_attempt_id: str = Field(..., description="Payment attempt identifier")
    observation_timestamp: dt.datetime | None = Field(
        default=None,
        description="Point-in-time reference for historical backtesting and evaluation",
    )


class PolicyDecisionResponse(BaseModel):
    """Optimal recovery decision produced by salvage-brain."""

    payment_attempt_id: str
    chosen_action: RecoveryActionType
    recovery_probability: float = Field(..., ge=0.0, le=1.0)
    expected_net_value_paise: int
    target_rail_id: str | None = None
    scheduled_delay_seconds: int | None = None
    nudge_channel: CommunicationChannel | None = None
    reasoning_tokens: list[str]
    candidate_valuations: list[ActionValuation]
    decided_at: dt.datetime
