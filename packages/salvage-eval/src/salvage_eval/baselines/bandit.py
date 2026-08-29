"""Contextual Bandit and Constrained Production Recovery Policies."""

from __future__ import annotations

from typing import Any

import numpy as np

from salvage_eval.baselines.base import AbstractPolicy
from salvage_eval.types import EvaluatedAction


class ContextualBanditPolicy(AbstractPolicy):
    """Contextual bandit policy selecting actions proportional to expected net payoff."""

    def __init__(self, temperature: float = 1.0, is_constrained: bool = True) -> None:
        self.temperature = temperature
        self.is_constrained = is_constrained

    @property
    def name(self) -> str:
        if self.is_constrained:
            return "Constrained Bandit (Salvage Policy)"
        return "Contextual Bandit (Unconstrained)"

    def predict_probabilities(
        self,
        context: dict[str, Any],
        feasible_actions: list[EvaluatedAction],
    ) -> dict[EvaluatedAction, float]:
        tax = str(context.get("taxonomy_code", "UNKNOWN"))
        amount = float(context.get("amount_paise", 100000))
        rail_state = str(context.get("rail_state", "HEALTHY"))
        is_pre_payday = bool(context.get("is_salary_cycle_pre_payday", False))

        # Payoff heuristics calibrated against recoverability models
        q_values: dict[EvaluatedAction, float] = {}

        # RETRY_IMMEDIATE
        if tax == "NETWORK_TIMEOUT" and rail_state == "HEALTHY":
            p_imm = 0.82
        elif tax == "ISSUER_OUTAGE":
            p_imm = 0.05
        else:
            p_imm = 0.02
        q_values[EvaluatedAction.RETRY_IMMEDIATE] = p_imm * amount - 50.0

        # RETRY_SCHEDULED
        if tax == "INSUFFICIENT_FUNDS" and is_pre_payday:
            p_sched = 0.78
        elif tax == "ISSUER_OUTAGE":
            p_sched = 0.75
        else:
            p_sched = 0.50
        q_values[EvaluatedAction.RETRY_SCHEDULED] = p_sched * amount - 70.0

        # SWITCH_RAIL
        p_switch = 0.85 if tax in ("ISSUER_OUTAGE", "NETWORK_TIMEOUT") else 0.10
        q_values[EvaluatedAction.SWITCH_RAIL] = p_switch * amount - 75.0

        # CUSTOMER_NUDGE
        if tax in ("CUSTOMER_ABANDONED", "CARD_EXPIRED"):
            p_nudge = 0.68
        elif tax == "INSUFFICIENT_FUNDS":
            p_nudge = 0.58
        else:
            p_nudge = 0.30
        q_values[EvaluatedAction.CUSTOMER_NUDGE] = p_nudge * amount - 200.0

        # NO_ACTION
        q_values[EvaluatedAction.NO_ACTION] = 0.0

        # Mask unfeasible actions if constrained
        allowed = list(feasible_actions) if self.is_constrained else list(EvaluatedAction)
        if EvaluatedAction.NO_ACTION not in allowed:
            allowed.append(EvaluatedAction.NO_ACTION)

        # Softmax over allowed actions
        allowed_q = np.array(
            [q_values[a] / max(amount * 0.1, 100.0) for a in allowed],
            dtype=np.float64,
        )
        allowed_q -= np.max(allowed_q)  # numerical stability
        exp_q = np.exp(allowed_q / self.temperature)
        probs = exp_q / np.sum(exp_q)

        result = {a: 0.0 for a in EvaluatedAction}
        for act, prob in zip(allowed, probs, strict=False):
            result[act] = float(prob)

        return result
