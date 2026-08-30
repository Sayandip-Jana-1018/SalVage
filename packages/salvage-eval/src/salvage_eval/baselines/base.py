"""Base interface for evaluation recovery policies."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from salvage_eval.types import EvaluatedAction


class AbstractPolicy(ABC):
    """A recovery policy the harness can evaluate.

    Two different probabilities matter here and they must not be confused:

    ``predict_probabilities`` returns **P(action | context)** -- how the policy
    distributes its choice across the action space. The off-policy estimators
    need this, because it is the target distribution importance weights are
    computed against.

    ``predict_recovery_probability`` returns **P(recovery | context, action)``
    -- the policy's belief that a given action will actually recover the
    payment. Only a policy that models recovery has one, and calibration is
    measured against it.

    The harness previously fed the first into the calibration diagnostic and
    compared it against observed recovery. Those are unrelated quantities, and
    since every baseline except the bandit is deterministic, the "predicted
    probability" was 1.0 on every episode. That produced a Brier score of ~1.0
    and five empty deciles, which was read as evidence of a badly calibrated
    model. Nothing was being measured at all.
    """

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
        """Returns the action probability distribution P(A|X)."""

    def predict_recovery_probability(
        self,
        context: dict[str, Any],
        action: EvaluatedAction,
    ) -> float | None:
        """P(recovery | context, action), or None if this policy has no such belief.

        The default is ``None``: a policy expressed as a rule -- "always retry
        immediately", "never retry" -- holds no probabilistic belief about
        recovery, and inventing one so that a calibration number could be
        printed for it would be a fabricated measurement. Such policies are
        reported as having no calibration rather than as being badly
        calibrated, and the two are not the same claim.
        """
        return None

    def choose_action(
        self,
        context: dict[str, Any],
        feasible_actions: list[EvaluatedAction],
    ) -> EvaluatedAction:
        """Selects the highest-probability feasible action."""
        probs = self.predict_probabilities(context, feasible_actions)
        return max(probs.items(), key=lambda kv: kv[1])[0]
