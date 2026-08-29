"""Base interface for evaluation recovery policies."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from salvage_eval.types import EvaluatedAction


class AbstractPolicy(ABC):
    """Abstract base class for recovery policies evaluated by the harness."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name of the policy."""

    @abstractmethod
    def predict_probabilities(
        self,
        context: dict[str, Any],
        feasible_actions: list[EvaluatedAction],
    ) -> dict[EvaluatedAction, float]:
        """Returns action probability distribution P(A|X)."""

    def choose_action(
        self,
        context: dict[str, Any],
        feasible_actions: list[EvaluatedAction],
    ) -> EvaluatedAction:
        """Selects the highest-probability feasible action."""
        probs = self.predict_probabilities(context, feasible_actions)
        return max(probs.items(), key=lambda kv: kv[1])[0]
