"""The Salvage policy: expected-net-value maximisation over a bounded action set."""

from __future__ import annotations

from typing import Any

import numpy as np

from salvage_eval.baselines.base import AbstractPolicy
from salvage_eval.baselines.observable import ObservedCause, is_permanent, observed_cause
from salvage_eval.types import EvaluatedAction

# Action costs in paise, mirroring recovery_actions.cost_paise in
# packages/salvage-sim/calibration.yaml. The policy must hold its own cost
# model -- it is choosing under a budget, not being scored by one -- but the
# two should agree, and a divergence here is a bug.
COST_PAISE: dict[EvaluatedAction, int] = {
    EvaluatedAction.RETRY_IMMEDIATE: 50,
    EvaluatedAction.RETRY_SCHEDULED: 70,
    EvaluatedAction.SWITCH_RAIL: 75,
    EvaluatedAction.NO_ACTION: 0,
}


class ContextualBanditPolicy(AbstractPolicy):
    """Scores each feasible action by expected net value and softmaxes over the result.

    **Provenance of the probabilities below.** They mirror
    ``services/salvage-brain/src/salvage_brain/policy/recoverability.py``,
    which is the model this product actually ships. They are hand-written
    priors: nobody fitted them, and nothing in this repository has validated
    them against data. Measuring how wrong they are is the entire point of the
    calibration diagnostic, and :meth:`predict_recovery_probability` exposes
    them so that it can.

    **What changed.** An earlier version of this class carried the *data
    generator's* parameters -- the harness invented its own ground truth from
    a table of constants, and this policy held that same table offset by about
    0.03, identical in one case. The reported margin over the baselines
    measured agreement between two hand-written tables. Ground truth now comes
    from ``salvage-sim``'s materialised causal world, which no lookup table
    can encode, so the margin has to come from the features or not at all.
    """

    def __init__(self, temperature: float = 1.0, is_constrained: bool = True) -> None:
        self.temperature = temperature
        self.is_constrained = is_constrained

    @property
    def name(self) -> str:
        if self.is_constrained:
            return "Constrained Bandit (Salvage Policy)"
        return "Contextual Bandit (Unconstrained)"

    def predict_recovery_probability(
        self,
        context: dict[str, Any],
        action: EvaluatedAction,
    ) -> float | None:
        """P(recovery | context, action) under the shipped priors."""
        if action is EvaluatedAction.NO_ACTION:
            # Not "recovery is impossible" -- an order can resolve on its own.
            # This policy holds no belief about unattended recovery, so it
            # declines to state one rather than asserting zero.
            return None

        cause = observed_cause(context)
        if is_permanent(cause):
            return 0.0

        pre_payday = bool(context.get("is_salary_cycle_pre_payday", False))

        if action is EvaluatedAction.RETRY_IMMEDIATE:
            if cause is ObservedCause.ISSUER_TROUBLE:
                return 0.05
            if cause is ObservedCause.INSUFFICIENT_FUNDS:
                return 0.02
            if cause is ObservedCause.DECLINED:
                return 0.10
            return 0.15  # UNKNOWN: the generic code tells us nothing.

        if action is EvaluatedAction.RETRY_SCHEDULED:
            if cause is ObservedCause.INSUFFICIENT_FUNDS:
                return 0.78 if pre_payday else 0.52
            if cause is ObservedCause.ISSUER_TROUBLE:
                return 0.75
            if cause is ObservedCause.DECLINED:
                return 0.35
            return 0.35

        if action is EvaluatedAction.SWITCH_RAIL:
            if cause is ObservedCause.ISSUER_TROUBLE:
                return 0.85
            if cause is ObservedCause.INSUFFICIENT_FUNDS:
                # A different rail does not create money in the account.
                return 0.08
            return 0.30

        return None

    def predict_probabilities(
        self,
        context: dict[str, Any],
        feasible_actions: list[EvaluatedAction],
    ) -> dict[EvaluatedAction, float]:
        amount = float(context.get("amount_paise", 100000))

        allowed = list(feasible_actions) if self.is_constrained else list(EvaluatedAction)
        if EvaluatedAction.NO_ACTION not in allowed:
            allowed.append(EvaluatedAction.NO_ACTION)

        q_values: dict[EvaluatedAction, float] = {}
        for action in allowed:
            if action is EvaluatedAction.NO_ACTION:
                q_values[action] = 0.0
                continue
            probability = self.predict_recovery_probability(context, action)
            if probability is None:
                q_values[action] = 0.0
                continue
            q_values[action] = probability * amount - COST_PAISE.get(action, 0)

        # Softmax, scaled by the order size so that temperature means the same
        # thing on a 500-rupee order as on a 5,000-rupee one.
        scale = max(amount * 0.1, 100.0)
        logits = np.array([q_values[a] / scale for a in allowed], dtype=np.float64)
        logits -= np.max(logits)
        exponentiated = np.exp(logits / self.temperature)
        probabilities = exponentiated / np.sum(exponentiated)

        result = {a: 0.0 for a in EvaluatedAction}
        for action, probability in zip(allowed, probabilities, strict=True):
            result[action] = float(probability)
        return result
