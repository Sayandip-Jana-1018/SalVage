"""Causal recoverability estimation models predicting P(recovery | action, features)."""

from __future__ import annotations

from salvage_brain.diagnosis.models import DiagnosisResponse
from salvage_brain.features.extractor import ExtractedFeatures
from salvage_brain.policy.models import RecoveryActionType
from salvage_brain.sensing.models import RailHealthSnapshot, RailState
from salvage_brain.taxonomy.codes import TaxonomyCode


class RecoverabilityModel:
    """Predicts conditional recovery probabilities across bounded recovery actions."""

    @classmethod
    def estimate_probability(
        cls,
        action: RecoveryActionType,
        features: ExtractedFeatures,
        rail_snapshot: RailHealthSnapshot,
        diagnosis: DiagnosisResponse,
    ) -> float:
        """Computes calibrated P(recovery | action) given point-in-time state."""
        tax = diagnosis.taxonomy_code
        rail_is_healthy = rail_snapshot.state == RailState.HEALTHY
        rail_is_down = rail_snapshot.state == RailState.DOWN

        if action == RecoveryActionType.NO_ACTION:
            return 0.0

        if action == RecoveryActionType.RETRY_IMMEDIATE:
            if tax == TaxonomyCode.NETWORK_TIMEOUT and rail_is_healthy:
                return 0.82
            if tax == TaxonomyCode.ISSUER_OUTAGE or rail_is_down:
                return 0.05
            if tax == TaxonomyCode.INSUFFICIENT_FUNDS:
                return 0.02
            if tax in (TaxonomyCode.MANDATE_INVALID, TaxonomyCode.CARD_EXPIRED):
                return 0.00
            if tax == TaxonomyCode.CUSTOMER_ABANDONED:
                return 0.10
            return 0.15

        if action == RecoveryActionType.RETRY_SCHEDULED:
            if tax == TaxonomyCode.INSUFFICIENT_FUNDS:
                if features.is_salary_cycle_pre_payday:
                    # High probability if scheduled after payday
                    return 0.78
                return 0.52
            if tax == TaxonomyCode.ISSUER_OUTAGE:
                # Bank recovery after typical outage duration (30-60 min)
                return 0.75
            if tax == TaxonomyCode.NETWORK_TIMEOUT:
                return 0.80
            if tax in (TaxonomyCode.MANDATE_INVALID, TaxonomyCode.CARD_EXPIRED):
                return 0.00
            return 0.35

        if action == RecoveryActionType.SWITCH_RAIL:
            if tax in (TaxonomyCode.ISSUER_OUTAGE, TaxonomyCode.NETWORK_TIMEOUT):
                return 0.85
            if tax == TaxonomyCode.INSUFFICIENT_FUNDS:
                return 0.08
            if tax == TaxonomyCode.MANDATE_INVALID:
                # The mandate is terminated. Nothing collects on this order,
                # on any rail, at any delay.
                return 0.00
            if tax == TaxonomyCode.CARD_EXPIRED:
                # The card is dead; the customer is not. Moving the payment to
                # another method is exactly the fix, and this is the one
                # taxonomy code where switching rails is the *whole* answer.
                #
                # This returned 0.00 until the evaluation harness measured it.
                # Over held-out episodes a rail switch after an expired-card
                # failure recovered around 72% of the time, while this line
                # was telling the optimiser it never worked -- so the policy
                # never switched, and all of that was left uncollected. See
                # EVALUATION.md, "What the fitted model learned".
                return 0.72
            return 0.30

        if action == RecoveryActionType.CUSTOMER_NUDGE:
            if tax == TaxonomyCode.CUSTOMER_ABANDONED:
                return 0.68
            if tax == TaxonomyCode.CARD_EXPIRED:
                return 0.62
            if tax == TaxonomyCode.INSUFFICIENT_FUNDS:
                return 0.58
            if tax in (TaxonomyCode.ISSUER_OUTAGE, TaxonomyCode.NETWORK_TIMEOUT):
                return 0.35
            if tax == TaxonomyCode.RISK_DECLINE:
                return 0.00
            return 0.40

        return 0.0
