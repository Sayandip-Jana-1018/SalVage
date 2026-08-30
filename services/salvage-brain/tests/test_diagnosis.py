"""Unit tests for the Sense & Diagnose Engine."""

from __future__ import annotations

import datetime as dt

from salvage_brain.diagnosis.engine import DiagnosisEngine
from salvage_brain.diagnosis.models import SuggestedAction
from salvage_brain.features.extractor import ExtractedFeatures
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


def _dummy_snapshot(
    rail_id: str,
    state: RailState = RailState.HEALTHY,
    sr: float = 1.0,
) -> RailHealthSnapshot:
    return RailHealthSnapshot(
        rail_id=rail_id,
        state=state,
        success_rate_5m=sr,
        failure_velocity_5m=0.0,
        window_1m=_dummy_stats(sr),
        window_5m=_dummy_stats(sr),
        window_15m=_dummy_stats(sr),
        last_evaluated_at=dt.datetime.now(dt.UTC),
    )


def _dummy_features(
    error_code: str = "INSUFFICIENT_FUNDS",
    error_desc: str | None = None,
    is_recurring: bool = False,
    is_pre_payday: bool = False,
) -> ExtractedFeatures:
    now = dt.datetime.now(dt.UTC)
    return ExtractedFeatures(
        merchant_id="m_test",
        payment_attempt_id="att_test_1",
        customer_id="cust_1",
        amount_paise=50000,
        amount_log=10.8,
        currency="INR",
        payment_method="upi",
        provider="razorpay",
        issuer="issuer_alpha",
        is_recurring=is_recurring,
        rail_id="issuer_alpha|UPI|RAZORPAY",
        hour_of_day_ist=14,
        day_of_week=2,
        day_of_month=25 if is_pre_payday else 15,
        is_salary_cycle_pre_payday=is_pre_payday,
        is_salary_cycle_post_payday=False,
        customer_total_attempts=5,
        customer_failure_rate=0.2,
        failure_event_count=1,
        latest_error_code=error_code,
        latest_error_desc=error_desc,
        observation_timestamp=now,
    )


def test_insufficient_funds_diagnosis_on_recurring_suggests_smart_schedule() -> None:
    features = _dummy_features("U30", is_recurring=True, is_pre_payday=True)
    snapshot = _dummy_snapshot("issuer_alpha|UPI|RAZORPAY", RailState.HEALTHY)

    resp = DiagnosisEngine.diagnose(features, snapshot)
    assert resp.taxonomy_code == TaxonomyCode.INSUFFICIENT_FUNDS
    assert resp.confidence >= 0.95
    assert resp.suggested_action == SuggestedAction.RETRY_SMART_SCHEDULE
    assert "PRE_PAYDAY_BALANCE_PRESSURE" in resp.explainability_tokens


def test_insufficient_funds_on_adhoc_checkout_suggests_customer_nudge() -> None:
    features = _dummy_features("INSUFFICIENT_FUNDS", is_recurring=False)
    snapshot = _dummy_snapshot("issuer_alpha|UPI|RAZORPAY", RailState.HEALTHY)

    resp = DiagnosisEngine.diagnose(features, snapshot)
    assert resp.taxonomy_code == TaxonomyCode.INSUFFICIENT_FUNDS
    assert resp.suggested_action == SuggestedAction.CUSTOMER_NUDGE


def test_systemic_rail_outage_corroborates_issuer_outage_and_suggests_rail_switch() -> None:
    features = _dummy_features("NETWORK_TIMEOUT")
    snapshot = _dummy_snapshot("issuer_alpha|UPI|RAZORPAY", RailState.DOWN, sr=0.40)

    resp = DiagnosisEngine.diagnose(features, snapshot)
    assert resp.taxonomy_code == TaxonomyCode.ISSUER_OUTAGE
    assert resp.confidence >= 0.95
    assert resp.suggested_action == SuggestedAction.SWITCH_RAIL
    assert "SYSTEMIC_OUTAGE_CORROBORATED" in resp.explainability_tokens


def test_transient_timeout_on_healthy_rail_suggests_immediate_retry() -> None:
    features = _dummy_features("NETWORK_TIMEOUT")
    snapshot = _dummy_snapshot("issuer_alpha|UPI|RAZORPAY", RailState.HEALTHY, sr=1.0)

    resp = DiagnosisEngine.diagnose(features, snapshot)
    assert resp.taxonomy_code == TaxonomyCode.NETWORK_TIMEOUT
    assert resp.suggested_action == SuggestedAction.RETRY_IMMEDIATE
    assert "TRANSIENT_GATEWAY_TIMEOUT" in resp.explainability_tokens


def test_mandate_invalid_suggests_no_action() -> None:
    features = _dummy_features("MANDATE_EXPIRED")
    snapshot = _dummy_snapshot("issuer_alpha|UPI|RAZORPAY", RailState.HEALTHY)

    resp = DiagnosisEngine.diagnose(features, snapshot)
    assert resp.taxonomy_code == TaxonomyCode.MANDATE_INVALID
    assert resp.suggested_action == SuggestedAction.NO_ACTION
