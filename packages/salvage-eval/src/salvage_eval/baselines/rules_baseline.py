"""Baseline policy: Heuristic diagnostic rules."""

from __future__ import annotations

from typing import Any

from salvage_eval.baselines.base import AbstractPolicy
from salvage_eval.types import EvaluatedAction


class RulesBaselinePolicy(AbstractPolicy):
    """Deterministic heuristic rules baseline based on failure taxonomy."""

    @property
    def name(self) -> str:
        return "Rules Baseline"

    def predict_probabilities(
        self,
        context: dict[str, Any],
        feasible_actions: list[EvaluatedAction],
    ) -> dict[EvaluatedAction, float]:
        tax = str(context.get("taxonomy_code", "UNKNOWN"))
        rail_state = str(context.get("rail_state", "HEALTHY"))

        if tax == "NETWORK_TIMEOUT" and rail_state == "HEALTHY":
            desired = EvaluatedAction.RETRY_IMMEDIATE
        elif tax == "INSUFFICIENT_FUNDS":
            desired = EvaluatedAction.RETRY_SCHEDULED
        elif tax == "ISSUER_OUTAGE" or rail_state in ("DEGRADED", "DOWN"):
            desired = EvaluatedAction.SWITCH_RAIL
        elif tax in ("CARD_EXPIRED", "CUSTOMER_ABANDONED"):
            desired = EvaluatedAction.CUSTOMER_NUDGE
        else:
            desired = EvaluatedAction.NO_ACTION

        # Mask with feasible actions
        chosen = desired if desired in feasible_actions else EvaluatedAction.NO_ACTION
        return {act: 1.0 if act == chosen else 0.0 for act in EvaluatedAction}
