"""Expected Net Utility optimizer for autonomous payment recovery actions."""

from __future__ import annotations

from typing import ClassVar

from salvage_brain.diagnosis.models import DiagnosisResponse
from salvage_brain.features.extractor import ExtractedFeatures
from salvage_brain.policy.models import (
    ActionValuation,
    CommunicationChannel,
    RecoveryActionType,
)
from salvage_brain.policy.recoverability import RecoverabilityModel
from salvage_brain.sensing.models import RailHealthSnapshot, RailState
from salvage_brain.taxonomy.codes import TaxonomyCode


class PolicyOptimizer:
    """Evaluates expected payoffs and selects the optimal bounded recovery action."""

    # Standard fee and friction estimates in paise (1 INR = 100 paise)
    COST_RETRY_IMMEDIATE_PAISE: ClassVar[int] = 50
    COST_RETRY_SCHEDULED_PAISE: ClassVar[int] = 70
    COST_SWITCH_RAIL_PAISE: ClassVar[int] = 75
    COST_NUDGE_WHATSAPP_PAISE: ClassVar[int] = 200  # API fee + friction penalty
    COST_NUDGE_SMS_PAISE: ClassVar[int] = 170

    @classmethod
    def evaluate_actions(
        cls,
        features: ExtractedFeatures,
        rail_snapshot: RailHealthSnapshot,
        diagnosis: DiagnosisResponse,
        active_rails: list[RailHealthSnapshot],
    ) -> tuple[
        RecoveryActionType,
        float,
        int,
        list[ActionValuation],
        str | None,
        int | None,
        CommunicationChannel | None,
        list[str],
    ]:
        """Evaluates all candidate actions and returns the optimal policy decision."""
        valuations: list[ActionValuation] = []
        tokens: list[str] = []

        # Candidate action list
        candidates = [
            RecoveryActionType.RETRY_IMMEDIATE,
            RecoveryActionType.RETRY_SCHEDULED,
            RecoveryActionType.SWITCH_RAIL,
            RecoveryActionType.CUSTOMER_NUDGE,
            RecoveryActionType.NO_ACTION,
        ]

        for action in candidates:
            prob = RecoverabilityModel.estimate_probability(
                action, features, rail_snapshot, diagnosis
            )
            gross = int(prob * features.amount_paise)

            if action == RecoveryActionType.RETRY_IMMEDIATE:
                cost = cls.COST_RETRY_IMMEDIATE_PAISE
            elif action == RecoveryActionType.RETRY_SCHEDULED:
                cost = cls.COST_RETRY_SCHEDULED_PAISE
            elif action == RecoveryActionType.SWITCH_RAIL:
                cost = cls.COST_SWITCH_RAIL_PAISE
            elif action == RecoveryActionType.CUSTOMER_NUDGE:
                cost = (
                    cls.COST_NUDGE_WHATSAPP_PAISE
                    if features.amount_paise >= 50000
                    else cls.COST_NUDGE_SMS_PAISE
                )
            else:
                cost = 0

            net = gross - cost if action != RecoveryActionType.NO_ACTION else 0

            valuations.append(
                ActionValuation(
                    action=action,
                    recovery_probability=round(prob, 4),
                    gross_expected_value_paise=gross,
                    estimated_cost_paise=cost,
                    net_expected_value_paise=net,
                )
            )

        # Select action with highest positive expected net utility
        best_valuation = max(valuations, key=lambda v: v.net_expected_value_paise)

        if (
            best_valuation.net_expected_value_paise <= 0
            or diagnosis.taxonomy_code == TaxonomyCode.MANDATE_INVALID
        ):
            chosen_action = RecoveryActionType.NO_ACTION
            best_prob = 0.0
            best_net = 0
            tokens.append("NEGATIVE_OR_ZERO_EXPECTED_UTILITY_NOOP")
        else:
            chosen_action = best_valuation.action
            best_prob = best_valuation.recovery_probability
            best_net = best_valuation.net_expected_value_paise
            tokens.append(f"MAX_EXPECTED_NET_VALUE_{best_net}_PAISE")

        # Determine parameter metadata
        target_rail_id: str | None = None
        scheduled_delay: int | None = None
        nudge_channel: CommunicationChannel | None = None

        if chosen_action == RecoveryActionType.SWITCH_RAIL:
            # Pick the healthiest alternative rail
            candidates_rails = [
                r
                for r in active_rails
                if r.rail_id != features.rail_id and r.state == RailState.HEALTHY
            ]
            if candidates_rails:
                best_rail = max(candidates_rails, key=lambda r: r.success_rate_5m)
                target_rail_id = best_rail.rail_id
                tokens.append(f"TARGET_HEALTHY_RAIL_{target_rail_id}")
            else:
                target_rail_id = "HDFC|UPI|RAZORPAY"

        elif chosen_action == RecoveryActionType.RETRY_SCHEDULED:
            if (
                diagnosis.taxonomy_code == TaxonomyCode.INSUFFICIENT_FUNDS
                and features.is_salary_cycle_pre_payday
            ):
                # Schedule after estimated month-end payday (days remaining * 86400)
                days_left = max(28 - features.day_of_month, 1)
                scheduled_delay = days_left * 86400
                tokens.append(f"PAYDAY_ANCHORED_SCHEDULE_DELAY_{days_left}_DAYS")
            elif diagnosis.taxonomy_code == TaxonomyCode.ISSUER_OUTAGE:
                scheduled_delay = 1800  # 30 minutes for CBS recovery
                tokens.append("OUTAGE_EPISODE_RECOVERY_DELAY_30M")
            else:
                scheduled_delay = 300  # 5 minutes
                tokens.append("DEFAULT_SMART_SCHEDULE_DELAY_5M")

        elif chosen_action == RecoveryActionType.CUSTOMER_NUDGE:
            nudge_channel = (
                CommunicationChannel.WHATSAPP
                if features.amount_paise >= 50000
                else CommunicationChannel.SMS
            )
            tokens.append(f"NUDGE_CHANNEL_{nudge_channel.value}")

        return (
            chosen_action,
            best_prob,
            best_net,
            valuations,
            target_rail_id,
            scheduled_delay,
            nudge_channel,
            tokens,
        )
