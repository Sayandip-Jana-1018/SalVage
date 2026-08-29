"""Domain models and data schemas for the off-policy evaluation harness."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class EvaluatedAction(StrEnum):
    """The canonical 5-action space for payment recovery."""

    RETRY_IMMEDIATE = "RETRY_IMMEDIATE"
    RETRY_SCHEDULED = "RETRY_SCHEDULED"
    SWITCH_RAIL = "SWITCH_RAIL"
    CUSTOMER_NUDGE = "CUSTOMER_NUDGE"
    NO_ACTION = "NO_ACTION"


class LoggedEpisode(BaseModel):
    """A single logged payment failure recovery episode with propensity and counterfactuals."""

    episode_id: str
    context: dict[str, Any] = Field(..., description="Observed feature context X at decision time")
    action: EvaluatedAction = Field(..., description="Action taken under logging policy")
    propensity: float = Field(..., ge=0.0, le=1.0, description="Logged probability P(A|X)")
    feasible_actions: list[EvaluatedAction] = Field(
        default_factory=lambda: list(EvaluatedAction),
        description="Feasible action set permitted by safety bounds",
    )
    reward_paise: int = Field(..., description="Observed net economic payoff in paise")
    is_recovered: bool = Field(..., description="Binary recovery outcome")
    counterfactual_rewards: dict[str, int] = Field(
        default_factory=dict,
        description="Latent ground-truth counterfactual payoffs Y(a) from simulator",
    )
    counterfactual_recoveries: dict[str, bool] = Field(
        default_factory=dict,
        description="Latent ground-truth counterfactual binary recoveries from simulator",
    )


class EstimatorResult(BaseModel):
    """Statistical outcome produced by an off-policy estimator."""

    estimator_name: str
    estimated_value: float = Field(..., description="Point estimate of mean policy payoff in paise")
    ci_lower: float = Field(..., description="95% bootstrap confidence interval lower bound")
    ci_upper: float = Field(..., description="95% bootstrap confidence interval upper bound")
    standard_error: float = Field(..., description="Standard error of the estimate")
    effective_sample_size: float = Field(..., description="Effective sample size (Kish)")
    is_identifiable: bool = Field(
        default=True,
        description="False if policy explores outside logging support (deterministic strata)",
    )
    diagnostics_warning: str | None = None


class CalibrationMetrics(BaseModel):
    """Model calibration quality and reliability table."""

    brier_score: float
    expected_calibration_error: float
    deciles: list[dict[str, float]] = Field(
        ..., description="Decile bins with predicted prob, empirical accuracy, count"
    )


class RegretDecomposition(BaseModel):
    """Decomposition of the policy regret gap relative to hindsight-optimal decisions."""

    optimal_value: float
    achieved_value: float
    total_regret: float
    model_error_regret: float
    bounds_refusal_regret: float
    budget_exhaustion_regret: float
    exploration_cost_regret: float


class PolicyEvaluationSummary(BaseModel):
    """Comprehensive multi-estimator evaluation summary for a candidate policy."""

    policy_name: str
    ground_truth_value: float
    ground_truth_recovery_rate: float
    ips: EstimatorResult
    snips: EstimatorResult
    direct_method: EstimatorResult
    doubly_robust: EstimatorResult
    calibration: CalibrationMetrics | None = None
    regret: RegretDecomposition | None = None
