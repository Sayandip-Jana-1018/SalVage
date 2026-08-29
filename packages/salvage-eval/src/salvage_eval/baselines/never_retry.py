"""Baseline policy: Never retry (always takes NO_ACTION)."""

from __future__ import annotations

from typing import Any

from salvage_eval.baselines.base import AbstractPolicy
from salvage_eval.types import EvaluatedAction


class NeverRetryPolicy(AbstractPolicy):
    """Reference lower bound: takes no action on payment failure."""

    @property
    def name(self) -> str:
        return "Never Retry"

    def predict_probabilities(
        self,
        context: dict[str, Any],
        feasible_actions: list[EvaluatedAction],
    ) -> dict[EvaluatedAction, float]:
        return {
            act: 1.0 if act == EvaluatedAction.NO_ACTION else 0.0
            for act in EvaluatedAction
        }
