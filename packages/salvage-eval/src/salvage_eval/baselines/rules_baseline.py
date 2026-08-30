"""Baseline policy: heuristic rules over the observable failure code."""

from __future__ import annotations

from typing import Any

from salvage_eval.baselines.base import AbstractPolicy
from salvage_eval.baselines.observable import ObservedCause, is_permanent, observed_cause
from salvage_eval.types import EvaluatedAction


class RulesBaselinePolicy(AbstractPolicy):
    """One action per observed cause, with no valuation and no probabilities.

    This is the policy a competent engineer writes in an afternoon, and it is
    the bar the Salvage policy has to clear to justify its complexity. It
    holds no belief about recovery probability, so it reports no calibration
    rather than a fabricated one.
    """

    @property
    def name(self) -> str:
        return "Rules Baseline"

    def predict_probabilities(
        self,
        context: dict[str, Any],
        feasible_actions: list[EvaluatedAction],
    ) -> dict[EvaluatedAction, float]:
        cause = observed_cause(context)

        if is_permanent(cause):
            desired = EvaluatedAction.NO_ACTION
        elif cause is ObservedCause.ISSUER_TROUBLE:
            desired = EvaluatedAction.SWITCH_RAIL
        elif cause is ObservedCause.INSUFFICIENT_FUNDS:
            desired = EvaluatedAction.RETRY_SCHEDULED
        elif cause is ObservedCause.DECLINED:
            desired = EvaluatedAction.NO_ACTION
        else:
            # Generic code. Waiting costs little and learns something; an
            # immediate retry against an unknown cause mostly buys a second
            # identical failure.
            desired = EvaluatedAction.RETRY_SCHEDULED

        chosen = desired if desired in feasible_actions else EvaluatedAction.NO_ACTION
        return {act: 1.0 if act == chosen else 0.0 for act in EvaluatedAction}
