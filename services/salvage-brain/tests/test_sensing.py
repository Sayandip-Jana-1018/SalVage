"""Unit tests for the real-time rail health sensing tracker."""

from __future__ import annotations

import datetime as dt

from salvage_brain.sensing.models import RailState
from salvage_brain.sensing.tracker import RailHealthTracker


def test_rail_starts_as_healthy_with_zero_events() -> None:
    tracker = RailHealthTracker()
    now = dt.datetime.now(dt.UTC)
    snapshot = tracker.get_snapshot("HDFC|UPI|RAZORPAY", now)

    assert snapshot.state == RailState.HEALTHY
    assert snapshot.success_rate_5m == 1.0
    assert snapshot.failure_velocity_5m == 0.0


def test_rail_degrades_and_goes_down_under_consecutive_failures() -> None:
    tracker = RailHealthTracker()
    now = dt.datetime.now(dt.UTC)
    rail = "ICICI|UPI|RAZORPAY"

    # Record 10 successes
    for i in range(10):
        t = now - dt.timedelta(seconds=120 - i * 5)
        tracker.record_outcome(rail, is_success=True, timestamp=t)

    snapshot_healthy = tracker.get_snapshot(rail, now)
    assert snapshot_healthy.state == RailState.HEALTHY
    assert snapshot_healthy.success_rate_5m == 1.0

    # Record 6 failures (causing SR to drop to 10/16 = 62.5% in 5m window)
    for i in range(6):
        t = now - dt.timedelta(seconds=30 - i * 4)
        tracker.record_outcome(rail, is_success=False, is_timeout=False, timestamp=t)

    snapshot_down = tracker.get_snapshot(rail, now)
    assert snapshot_down.state == RailState.DOWN
    assert snapshot_down.success_rate_5m < 0.70


def test_consecutive_timeout_spike_triggers_down_state_immediately() -> None:
    tracker = RailHealthTracker()
    now = dt.datetime.now(dt.UTC)
    rail = "SBI|UPI|RAZORPAY"

    # Record 10 successes
    for i in range(10):
        t = now - dt.timedelta(seconds=100 - i * 5)
        tracker.record_outcome(rail, is_success=True, timestamp=t)

    # Record 3 consecutive timeouts at the tail of the stream
    for i in range(3):
        t = now - dt.timedelta(seconds=10 - i * 2)
        tracker.record_outcome(rail, is_success=False, is_timeout=True, timestamp=t)

    snapshot = tracker.get_snapshot(rail, now)
    assert snapshot.state == RailState.DOWN


def test_old_events_outside_window_are_excluded() -> None:
    tracker = RailHealthTracker()
    now = dt.datetime.now(dt.UTC)
    rail = "AXIS|UPI|RAZORPAY"

    # Outage 10 minutes ago
    for i in range(10):
        t = now - dt.timedelta(minutes=10, seconds=i * 2)
        tracker.record_outcome(rail, is_success=False, timestamp=t)

    # Healthy in the last 2 minutes
    for i in range(10):
        t = now - dt.timedelta(seconds=100 - i * 5)
        tracker.record_outcome(rail, is_success=True, timestamp=t)

    snapshot = tracker.get_snapshot(rail, now)
    assert snapshot.state == RailState.HEALTHY
    assert snapshot.window_5m.failure_count == 0
    assert snapshot.window_15m.failure_count == 10
