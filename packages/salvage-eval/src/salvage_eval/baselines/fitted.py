"""A policy whose recovery probabilities were fitted, not written by hand."""

from __future__ import annotations

from typing import Any

import numpy as np

from salvage_eval.baselines.bandit import COST_PAISE
from salvage_eval.baselines.base import AbstractPolicy
from salvage_eval.model.fitted_recoverability import FittedRecoverabilityModel
from salvage_eval.types import EvaluatedAction


class FittedPolicy(AbstractPolicy):
    """Expected-net-value maximisation over a model fitted from logged outcomes.

    Identical in structure to :class:`~salvage_eval.baselines.bandit.ContextualBanditPolicy`
    -- same action space, same cost model, same softmax -- and different in
    exactly one respect: where that policy reads a hand-written table of
    probabilities, this one reads a table estimated from data it was fitted on
    and is scored on data it was not.

    Holding everything else constant is the point. The difference between the
    two policies in ``EVALUATION.md`` is then attributable to the probabilities
    and to nothing else, which is what makes it a measurement of the model
    rather than of two unrelated implementations.
    """

    def __init__(
        self,
        model: FittedRecoverabilityModel,
        temperature: float = 1.0,
        is_constrained: bool = True,
    ) -> None:
        self.model = model
        self.temperature = temperature
        self.is_constrained = is_constrained

    @property
    def name(self) -> str:
        return "Fitted Policy (learned probabilities)"

    def predict_recovery_probability(
        self, context: dict[str, Any], action: EvaluatedAction
    ) -> float | None:
        return self.model.predict(context, action)

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
            probability = self.model.predict(context, action)
            if action is EvaluatedAction.NO_ACTION:
                # Doing nothing costs nothing, and the value it captures is the
                # recovery that would have happened anyway. Every other action
                # is competing against that, not against zero -- which is what
                # stops the policy paying a fee for a recovery it would have
                # got free.
                q_values[action] = probability * amount
                continue
            q_values[action] = probability * amount - COST_PAISE.get(action, 0)

        scale = max(amount * 0.1, 100.0)
        logits = np.array([q_values[a] / scale for a in allowed], dtype=np.float64)
        logits -= np.max(logits)
        exponentiated = np.exp(logits / self.temperature)
        probabilities = exponentiated / np.sum(exponentiated)

        result = {a: 0.0 for a in EvaluatedAction}
        for action, probability in zip(allowed, probabilities, strict=True):
            result[action] = float(probability)
        return result
