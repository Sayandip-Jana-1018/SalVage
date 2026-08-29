"""Sense & Diagnose Engine combining taxonomy, real-time sensing, and feature engineering."""

from __future__ import annotations

import datetime as dt

from salvage_brain.diagnosis.models import DiagnosisResponse, SuggestedAction
from salvage_brain.features.extractor import ExtractedFeatures
from salvage_brain.sensing.models import RailHealthSnapshot, RailState
from salvage_brain.taxonomy.codes import TaxonomyCode
from salvage_brain.taxonomy.mapper import FailureTaxonomyMapper


class DiagnosisEngine:
    """Combines failure taxonomy, systemic rail health, and customer context into diagnoses."""

    @classmethod
    def diagnose(
        cls,
        features: ExtractedFeatures,
        rail_snapshot: RailHealthSnapshot,
    ) -> DiagnosisResponse:
        """Evaluates an attempt's features and rail health to produce a calibrated diagnosis."""
        # 1. Base classification from provider error signals
        mapping = FailureTaxonomyMapper.map_failure(
            features.latest_error_code,
            features.latest_error_desc,
        )

        tax_code = mapping.taxonomy_code
        confidence = mapping.confidence
        tokens: list[str] = [mapping.rule_matched]
        root_cause = f"Failure classified as {tax_code} from provider signal"
        action = SuggestedAction.NO_ACTION

        # 2. Systemic Rail Outage Corroboration
        is_rail_unhealthy = rail_snapshot.state in (RailState.DEGRADED, RailState.DOWN)
        if is_rail_unhealthy:
            tokens.append(f"RAIL_STATE_{rail_snapshot.state.value}")
            tokens.append(f"RAIL_SR_5M_{rail_snapshot.success_rate_5m:.2f}")

            # If rail is degraded or down, override/elevate to ISSUER_OUTAGE
            if tax_code in (
                TaxonomyCode.NETWORK_TIMEOUT,
                TaxonomyCode.UNKNOWN,
                TaxonomyCode.ISSUER_OUTAGE,
            ):
                tax_code = TaxonomyCode.ISSUER_OUTAGE
                confidence = max(confidence, 0.95)
                root_cause = f"Systemic issuer degradation observed on rail {features.rail_id}"
                tokens.append("SYSTEMIC_OUTAGE_CORROBORATED")
                action = SuggestedAction.SWITCH_RAIL
            elif mapping.is_retryable_alternative_rail:
                action = SuggestedAction.SWITCH_RAIL

        # 3. Taxonomy-specific contextual reasoning
        if tax_code == TaxonomyCode.INSUFFICIENT_FUNDS:
            if features.is_salary_cycle_pre_payday:
                confidence = min(confidence + 0.05, 0.99)
                tokens.append("PRE_PAYDAY_BALANCE_PRESSURE")
                root_cause = "Insufficient funds during pre-payday balance pressure window"
            elif features.is_salary_cycle_post_payday:
                tokens.append("POST_PAYDAY_UNEXPECTED_BALANCE_DEPLETION")

            if features.is_recurring:
                action = SuggestedAction.RETRY_SMART_SCHEDULE
            else:
                action = SuggestedAction.CUSTOMER_NUDGE

        elif tax_code == TaxonomyCode.NETWORK_TIMEOUT:
            if not is_rail_unhealthy:
                tokens.append("TRANSIENT_GATEWAY_TIMEOUT")
                root_cause = "Transient network glitch on healthy rail"
                action = SuggestedAction.RETRY_IMMEDIATE
            else:
                action = SuggestedAction.SWITCH_RAIL

        elif tax_code == TaxonomyCode.MANDATE_INVALID:
            tokens.append("MANDATE_TERMINATION_DETECTED")
            root_cause = "Mandate is expired or revoked by customer/bank"
            action = SuggestedAction.NO_ACTION

        elif tax_code == TaxonomyCode.CARD_EXPIRED:
            tokens.append("INSTRUMENT_EXPIRED")
            root_cause = "Payment card has passed validity expiration date"
            action = SuggestedAction.CUSTOMER_NUDGE

        elif tax_code == TaxonomyCode.CUSTOMER_ABANDONED:
            tokens.append("CUSTOMER_CHURN_OR_ABORT")
            root_cause = "Customer abandoned 2FA verification or cancelled flow"
            action = SuggestedAction.CUSTOMER_NUDGE

        elif tax_code == TaxonomyCode.RISK_DECLINE:
            tokens.append("RISK_VELOCITY_BLOCK")
            root_cause = "Transaction declined by gateway or issuer risk engine"
            action = SuggestedAction.NO_ACTION

        elif tax_code == TaxonomyCode.UNKNOWN:
            if is_rail_unhealthy:
                tax_code = TaxonomyCode.ISSUER_OUTAGE
                confidence = 0.85
                root_cause = "Ambiguous error during systemic rail degradation"
                action = SuggestedAction.SWITCH_RAIL
            else:
                confidence = 0.30
                root_cause = "Ambiguous failure code without sufficient systemic correlation"
                action = SuggestedAction.NO_ACTION

        return DiagnosisResponse(
            payment_attempt_id=features.payment_attempt_id,
            taxonomy_code=tax_code,
            confidence=round(confidence, 4),
            root_cause=root_cause,
            rail_id=features.rail_id,
            rail_state=rail_snapshot.state.value,
            explainability_tokens=tokens,
            suggested_action=action,
            diagnosed_at=dt.datetime.now(dt.UTC),
        )
