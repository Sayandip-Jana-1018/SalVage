"""Unit tests for the Expected Net Utility Policy Engine."""

from __future__ import annotations

import datetime as dt

from salvage_brain.diagnosis.models import DiagnosisResponse, SuggestedAction
from salvage_brain.features.extractor import ExtractedFeatures
from salvage_brain.policy.engine import PolicyEngine
from salvage_brain.policy.models import RecoveryActionType
from salvage_brain.sensing.models import RailHealthSnapshot, RailState, SlidingWindowStats
from salvage_brain.taxonomy.codes import TaxonomyCode


def _dummy_stats(sr: float = 1.0) -> SlidingWindowStats:
    return SlidingWindowStats(
        window_seconds=300,
        total_events=10,
        success_count=int(10 * sr),
        failure_count=int(10 * (1 - sr)),
        success_rate=sr,
        failure_velocity_per_min=0.0,
        timeout_count=0,
        timeout_ratio=0.0,
    )


def _dummy_snapshot(rail_id: str, state: RailState = RailState.HEALTHY) -> RailHealthSnapshot:
    return RailHealthSnapshot(
        rail_id=rail_id,
        state=state,
        success_rate_5m=1.0 if state == RailState.HEALTHY else 0.3,
        failure_velocity_5m=0.0,
        window_1m=_dummy_stats(1.0 if state == RailState.HEALTHY else 0.3),
        window_5m=_dummy_stats(1.0 if state == RailState.HEALTHY else 0.3),
        window_15m=_dummy_stats(1.0 if state == RailState.HEALTHY else 0.3),
        last_evaluated_at=dt.datetime.now(dt.UTC),
    )


def _dummy_features(
    amount_paise: int = 100000,
    is_pre_payday: bool = False,
) -> ExtractedFeatures:
    return ExtractedFeatures(
        merchant_id="m_test",
        payment_attempt_id="att_test",
        customer_id="cust_1",
        amount_paise=amount_paise,
        amount_log=11.5,
        currency="INR",
        payment_method="upi",
        provider="razorpay",
        issuer="issuer_alpha",
        is_recurring=True,
        rail_id="issuer_alpha|UPI|RAZORPAY",
        hour_of_day_ist=14,
        day_of_week=2,
        day_of_month=25 if is_pre_payday else 15,
        is_salary_cycle_pre_payday=is_pre_payday,
        is_salary_cycle_post_payday=False,
        customer_total_attempts=5,
        customer_failure_rate=0.2,
        failure_event_count=1,
        latest_error_code="U30",
        latest_error_desc="Insufficient funds",
        observation_timestamp=dt.datetime.now(dt.UTC),
    )


def test_policy_chooses_switch_rail_when_current_rail_is_down() -> None:
    features = _dummy_features(amount_paise=200000)
    current_snapshot = _dummy_snapshot("issuer_alpha|UPI|RAZORPAY", RailState.DOWN)
    alt_snapshot = _dummy_snapshot("issuer_beta|UPI|RAZORPAY", RailState.HEALTHY)
    active_rails = [current_snapshot, alt_snapshot]

    diag = DiagnosisResponse(
        payment_attempt_id="att_test",
        taxonomy_code=TaxonomyCode.ISSUER_OUTAGE,
        confidence=0.95,
        root_cause="Systemic CBS outage",
        rail_id="issuer_alpha|UPI|RAZORPAY",
        rail_state="DOWN",
        explainability_tokens=["SYSTEMIC_OUTAGE_CORROBORATED"],
        suggested_action=SuggestedAction.SWITCH_RAIL,
        diagnosed_at=dt.datetime.now(dt.UTC),
    )

    decision = PolicyEngine.decide(features, current_snapshot, diag, active_rails)

    assert decision.chosen_action == RecoveryActionType.SWITCH_RAIL
    assert decision.target_rail_id == "issuer_beta|UPI|RAZORPAY"
    assert decision.expected_net_value_paise > 0
    assert decision.recovery_probability >= 0.80


def test_policy_chooses_smart_scheduled_retry_for_pre_payday_insufficient_funds() -> None:
    features = _dummy_features(amount_paise=150000, is_pre_payday=True)
    snapshot = _dummy_snapshot("issuer_alpha|UPI|RAZORPAY", RailState.HEALTHY)
    active_rails = [snapshot]

    diag = DiagnosisResponse(
        payment_attempt_id="att_test",
        taxonomy_code=TaxonomyCode.INSUFFICIENT_FUNDS,
        confidence=0.95,
        root_cause="Insufficient balance during pre-payday window",
        rail_id="issuer_alpha|UPI|RAZORPAY",
        rail_state="HEALTHY",
        explainability_tokens=["PRE_PAYDAY_BALANCE_PRESSURE"],
        suggested_action=SuggestedAction.RETRY_SMART_SCHEDULE,
        diagnosed_at=dt.datetime.now(dt.UTC),
    )

    decision = PolicyEngine.decide(features, snapshot, diag, active_rails)

    assert decision.chosen_action == RecoveryActionType.RETRY_SCHEDULED
    assert decision.scheduled_delay_seconds is not None
    assert decision.scheduled_delay_seconds > 0
    assert decision.expected_net_value_paise > 0


def test_switch_rail_is_not_chosen_when_no_healthy_alternative_exists() -> None:
    """A broad outage must not produce a rail switch with nowhere to switch to.

    This pins the fix for a bug where SWITCH_RAIL stayed in the candidate
    list during a total outage, won on a probability derived from the
    taxonomy alone, and was then handed a hardcoded target rail naming a real
    bank -- assigned precisely when the evidence said no rail was healthy.
    """
    features = _dummy_features(amount_paise=200000)
    current_snapshot = _dummy_snapshot("issuer_alpha|UPI|RAZORPAY", RailState.DOWN)
    # Every observed alternative is also down. There is nowhere better to go.
    alt_snapshot = _dummy_snapshot("issuer_beta|UPI|RAZORPAY", RailState.DOWN)
    active_rails = [current_snapshot, alt_snapshot]

    diag = DiagnosisResponse(
        payment_attempt_id="att_test",
        taxonomy_code=TaxonomyCode.ISSUER_OUTAGE,
        confidence=0.95,
        root_cause="Systemic CBS outage",
        rail_id="issuer_alpha|UPI|RAZORPAY",
        rail_state="DOWN",
        explainability_tokens=["SYSTEMIC_OUTAGE_CORROBORATED"],
        suggested_action=SuggestedAction.SWITCH_RAIL,
        diagnosed_at=dt.datetime.now(dt.UTC),
    )

    decision = PolicyEngine.decide(features, current_snapshot, diag, active_rails)

    assert decision.chosen_action != RecoveryActionType.SWITCH_RAIL
    # No rail is named, because no rail was chosen.
    assert decision.target_rail_id is None
    assert "SWITCH_RAIL_UNAVAILABLE_NO_HEALTHY_ALTERNATIVE" in decision.reasoning_tokens
    # SWITCH_RAIL is absent from the ranking entirely rather than listed at
    # zero: it was never an option, and showing it as a scored-and-rejected
    # candidate would misrepresent what the optimiser actually compared.
    assert all(v.action != RecoveryActionType.SWITCH_RAIL for v in decision.candidate_valuations)


def test_switch_rail_ignores_the_failed_rail_when_picking_a_target() -> None:
    """The rail that just failed is never its own alternative."""
    features = _dummy_features(amount_paise=200000)
    # The current rail is HEALTHY by the sensing window but this attempt on it
    # still failed, so it remains excluded as a switch target.
    current_snapshot = _dummy_snapshot("issuer_alpha|UPI|RAZORPAY", RailState.HEALTHY)
    active_rails = [current_snapshot]

    diag = DiagnosisResponse(
        payment_attempt_id="att_test",
        taxonomy_code=TaxonomyCode.ISSUER_OUTAGE,
        confidence=0.95,
        root_cause="Systemic CBS outage",
        rail_id="issuer_alpha|UPI|RAZORPAY",
        rail_state="HEALTHY",
        explainability_tokens=["SYSTEMIC_OUTAGE_CORROBORATED"],
        suggested_action=SuggestedAction.SWITCH_RAIL,
        diagnosed_at=dt.datetime.now(dt.UTC),
    )

    decision = PolicyEngine.decide(features, current_snapshot, diag, active_rails)

    assert decision.target_rail_id != "issuer_alpha|UPI|RAZORPAY"
    assert decision.chosen_action != RecoveryActionType.SWITCH_RAIL


def test_policy_chooses_noop_for_invalid_mandate() -> None:
    features = _dummy_features(amount_paise=100000)
    snapshot = _dummy_snapshot("issuer_alpha|UPI|RAZORPAY", RailState.HEALTHY)
    active_rails = [snapshot]

    diag = DiagnosisResponse(
        payment_attempt_id="att_test",
        taxonomy_code=TaxonomyCode.MANDATE_INVALID,
        confidence=0.99,
        root_cause="Mandate expired or revoked",
        rail_id="issuer_alpha|UPI|RAZORPAY",
        rail_state="HEALTHY",
        explainability_tokens=["MANDATE_TERMINATED"],
        suggested_action=SuggestedAction.NO_ACTION,
        diagnosed_at=dt.datetime.now(dt.UTC),
    )

    decision = PolicyEngine.decide(features, snapshot, diag, active_rails)

    assert decision.chosen_action == RecoveryActionType.NO_ACTION
    assert decision.recovery_probability == 0.0
    assert decision.expected_net_value_paise == 0
