"""Baseline policy: Blind immediate retry up to 3 attempts."""

from __future__ import annotations

from typing import Any

from salvage_eval.baselines.base import AbstractPolicy
from salvage_eval.types import EvaluatedAction


class BlindRetryPolicy(AbstractPolicy):
    """Retries immediately if attempt count < 3 and action is feasible, else NO_ACTION."""

    @property
    def name(self) -> str:
        return "Blind Immediate Retry (<=3x)"

    def predict_probabilities(
        self,
        context: dict[str, Any],
        feasible_actions: list[EvaluatedAction],
    ) -> dict[EvaluatedAction, float]:
        attempt_count = int(context.get("attempt_count", 1))
        can_retry = (
            attempt_count < 3 and EvaluatedAction.RETRY_IMMEDIATE in feasible_actions
        )

        chosen = EvaluatedAction.RETRY_IMMEDIATE if can_retry else EvaluatedAction.NO_ACTION
        return {act: 1.0 if act == chosen else 0.0 for act in EvaluatedAction}
