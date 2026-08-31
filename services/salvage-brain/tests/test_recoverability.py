"""Unit tests for the causal recoverability estimation model."""

from __future__ import annotations

import datetime as dt

from salvage_brain.diagnosis.models import DiagnosisResponse, SuggestedAction
from salvage_brain.features.extractor import ExtractedFeatures
from salvage_brain.policy.models import RecoveryActionType
from salvage_brain.policy.recoverability import RecoverabilityModel
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


def _dummy_snapshot(state: RailState = RailState.HEALTHY) -> RailHealthSnapshot:
    return RailHealthSnapshot(
        rail_id="issuer_alpha|UPI|RAZORPAY",
        state=state,
        success_rate_5m=1.0 if state == RailState.HEALTHY else 0.4,
        failure_velocity_5m=0.0,
        window_1m=_dummy_stats(1.0 if state == RailState.HEALTHY else 0.4),
        window_5m=_dummy_stats(1.0 if state == RailState.HEALTHY else 0.4),
        window_15m=_dummy_stats(1.0 if state == RailState.HEALTHY else 0.4),
        last_evaluated_at=dt.datetime.now(dt.UTC),
    )


def _dummy_features(is_pre_payday: bool = False) -> ExtractedFeatures:
    return ExtractedFeatures(
        merchant_id="m_test",
        payment_attempt_id="att_test",
        customer_id="cust_1",
        amount_paise=50000,
        amount_log=10.8,
        currency="INR",
        payment_method="upi",
        provider="razorpay",
        issuer="issuer_alpha",
        is_recurring=True,
        rail_id="issuer_alpha|UPI|RAZORPAY",
        hour_of_day_ist=12,
        day_of_week=3,
        day_of_month=25 if is_pre_payday else 10,
        is_salary_cycle_pre_payday=is_pre_payday,
        is_salary_cycle_post_payday=False,
        customer_total_attempts=5,
        customer_failure_rate=0.2,
        failure_event_count=1,
        latest_error_code="U30",
        latest_error_desc="Insufficient balance",
        observation_timestamp=dt.datetime.now(dt.UTC),
    )


def _dummy_diag(tax: TaxonomyCode) -> DiagnosisResponse:
    return DiagnosisResponse(
        payment_attempt_id="att_test",
        taxonomy_code=tax,
        confidence=0.95,
        root_cause="Test failure",
        rail_id="issuer_alpha|UPI|RAZORPAY",
        rail_state="HEALTHY",
        explainability_tokens=["TEST_TOKEN"],
        suggested_action=SuggestedAction.RETRY_IMMEDIATE,
        diagnosed_at=dt.datetime.now(dt.UTC),
    )


def test_immediate_retry_on_network_timeout_has_high_probability() -> None:
    features = _dummy_features()
    snapshot = _dummy_snapshot(RailState.HEALTHY)
    diag = _dummy_diag(TaxonomyCode.NETWORK_TIMEOUT)

    p = RecoverabilityModel.estimate_probability(
        RecoveryActionType.RETRY_IMMEDIATE, features, snapshot, diag
    )
    assert 0.70 <= p <= 0.95


def test_immediate_retry_on_issuer_outage_or_insufficient_funds_is_near_zero() -> None:
    features = _dummy_features()
    snapshot = _dummy_snapshot(RailState.DOWN)
    diag_outage = _dummy_diag(TaxonomyCode.ISSUER_OUTAGE)

    p_outage = RecoverabilityModel.estimate_probability(
        RecoveryActionType.RETRY_IMMEDIATE, features, snapshot, diag_outage
    )
    assert p_outage <= 0.10

    diag_funds = _dummy_diag(TaxonomyCode.INSUFFICIENT_FUNDS)
    p_funds = RecoverabilityModel.estimate_probability(
        RecoveryActionType.RETRY_IMMEDIATE, features, snapshot, diag_funds
    )
    assert p_funds <= 0.05


def test_scheduled_retry_on_salary_cycle_has_elevated_probability() -> None:
    features_payday = _dummy_features(is_pre_payday=True)
    snapshot = _dummy_snapshot(RailState.HEALTHY)
    diag = _dummy_diag(TaxonomyCode.INSUFFICIENT_FUNDS)

    p_payday = RecoverabilityModel.estimate_probability(
        RecoveryActionType.RETRY_SCHEDULED, features_payday, snapshot, diag
    )
    assert p_payday >= 0.70


def test_switch_rail_probability_high_on_issuer_outage() -> None:
    features = _dummy_features()
    snapshot = _dummy_snapshot(RailState.DOWN)
    diag = _dummy_diag(TaxonomyCode.ISSUER_OUTAGE)

    p = RecoverabilityModel.estimate_probability(
        RecoveryActionType.SWITCH_RAIL, features, snapshot, diag
    )
    assert p >= 0.80


def test_mandate_invalid_has_zero_recovery_across_automated_retries() -> None:
    features = _dummy_features()
    snapshot = _dummy_snapshot(RailState.HEALTHY)
    diag = _dummy_diag(TaxonomyCode.MANDATE_INVALID)

    p_imm = RecoverabilityModel.estimate_probability(
        RecoveryActionType.RETRY_IMMEDIATE, features, snapshot, diag
    )
    p_sched = RecoverabilityModel.estimate_probability(
        RecoveryActionType.RETRY_SCHEDULED, features, snapshot, diag
    )
    p_switch = RecoverabilityModel.estimate_probability(
        RecoveryActionType.SWITCH_RAIL, features, snapshot, diag
    )

    assert p_imm == 0.0
    assert p_sched == 0.0
    assert p_switch == 0.0


def test_an_expired_card_is_recoverable_by_switching_rails() -> None:
    """The card is dead; the customer is not.

    This returned 0.00 for every action until the evaluation harness measured
    it against ground truth: a rail switch after an expired-card failure
    recovers most of the time, because the customer still has money and still
    wants to pay. Treating the whole taxonomy code as permanent cost every one
    of those recoveries.

    Retrying the *same* rail stays at zero -- asking a dead card twice does
    not revive it -- which is the distinction the old code collapsed.
    """
    features = _dummy_features()
    snapshot = _dummy_snapshot(RailState.HEALTHY)
    diag = _dummy_diag(TaxonomyCode.CARD_EXPIRED)

    switch = RecoverabilityModel.estimate_probability(
        RecoveryActionType.SWITCH_RAIL, features, snapshot, diag
    )
    retry_now = RecoverabilityModel.estimate_probability(
        RecoveryActionType.RETRY_IMMEDIATE, features, snapshot, diag
    )
    retry_later = RecoverabilityModel.estimate_probability(
        RecoveryActionType.RETRY_SCHEDULED, features, snapshot, diag
    )

    assert switch > 0.5
    assert retry_now == 0.0
    assert retry_later == 0.0


def test_an_invalid_mandate_is_recoverable_by_nothing() -> None:
    """A terminated mandate collects on no rail at any delay."""
    features = _dummy_features()
    snapshot = _dummy_snapshot(RailState.HEALTHY)
    diag = _dummy_diag(TaxonomyCode.MANDATE_INVALID)

    for action in (
        RecoveryActionType.RETRY_IMMEDIATE,
        RecoveryActionType.RETRY_SCHEDULED,
        RecoveryActionType.SWITCH_RAIL,
    ):
        assert (
            RecoverabilityModel.estimate_probability(action, features, snapshot, diag) == 0.0
        ), f"{action} must be hopeless for a dead mandate"
