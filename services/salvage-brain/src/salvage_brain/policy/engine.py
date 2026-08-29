"""Policy Engine orchestrating point-in-time state into optimal recovery decisions."""

from __future__ import annotations

import datetime as dt

from salvage_brain.diagnosis.models import DiagnosisResponse
from salvage_brain.features.extractor import ExtractedFeatures
from salvage_brain.policy.models import PolicyDecisionResponse
from salvage_brain.policy.optimizer import PolicyOptimizer
from salvage_brain.sensing.models import RailHealthSnapshot


class PolicyEngine:
    """Computes bounded, explainable recovery policy decisions."""

    @classmethod
    def decide(
        cls,
        features: ExtractedFeatures,
        rail_snapshot: RailHealthSnapshot,
        diagnosis: DiagnosisResponse,
        active_rails: list[RailHealthSnapshot],
    ) -> PolicyDecisionResponse:
        """Evaluates features and sensing signals to produce an optimal PolicyDecisionResponse."""
        (
            action,
            prob,
            net_val,
            valuations,
            target_rail,
            scheduled_delay,
            nudge_channel,
            optimizer_tokens,
        ) = PolicyOptimizer.evaluate_actions(
            features=features,
            rail_snapshot=rail_snapshot,
            diagnosis=diagnosis,
            active_rails=active_rails,
        )

        all_tokens = list(diagnosis.explainability_tokens) + optimizer_tokens

        return PolicyDecisionResponse(
            payment_attempt_id=features.payment_attempt_id,
            chosen_action=action,
            recovery_probability=round(prob, 4),
            expected_net_value_paise=net_val,
            target_rail_id=target_rail,
            scheduled_delay_seconds=scheduled_delay,
            nudge_channel=nudge_channel,
            reasoning_tokens=all_tokens,
            candidate_valuations=valuations,
            decided_at=dt.datetime.now(dt.UTC),
        )
