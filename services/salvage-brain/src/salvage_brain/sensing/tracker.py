"""Real-time sliding window rail health tracker and anomaly detector."""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from dataclasses import dataclass
from typing import ClassVar

from salvage_brain.sensing.models import RailHealthSnapshot, RailState, SlidingWindowStats


@dataclass(frozen=True, slots=True)
class _RecordedEvent:
    timestamp: float  # epoch seconds
    is_success: bool
    is_timeout: bool


class RailHealthTracker:
    """Tracks sliding window stream metrics for payment rails and classifies health states."""

    # Default degradation thresholds
    HEALTHY_MIN_SR: ClassVar[float] = 0.95
    DEGRADED_MIN_SR: ClassVar[float] = 0.70
    MIN_EVENTS_FOR_CLASSIFICATION: ClassVar[int] = 5
    CONSECUTIVE_TIMEOUT_THRESHOLD: ClassVar[int] = 3

    def __init__(self) -> None:
        # rail_id -> list of recorded events sorted by timestamp
        self._events: dict[str, list[_RecordedEvent]] = defaultdict(list)

    def record_outcome(
        self,
        rail_id: str,
        is_success: bool,
        is_timeout: bool = False,
        timestamp: dt.datetime | None = None,
    ) -> None:
        """Records a transaction outcome on a given payment rail."""
        if not rail_id:
            return
        ts = (timestamp or dt.datetime.now(dt.UTC)).timestamp()
        event = _RecordedEvent(timestamp=ts, is_success=is_success, is_timeout=is_timeout)
        self._events[rail_id].append(event)
        # Keep list reasonably bounded (e.g. 1 hour max retention)
        cutoff = ts - 3600.0
        self._events[rail_id] = [e for e in self._events[rail_id] if e.timestamp >= cutoff]

    def _compute_window(
        self,
        events: list[_RecordedEvent],
        window_seconds: int,
        ref_timestamp: float,
    ) -> SlidingWindowStats:
        cutoff = ref_timestamp - window_seconds
        window_events = [e for e in events if cutoff <= e.timestamp <= ref_timestamp]
        total = len(window_events)
        if total == 0:
            return SlidingWindowStats(
                window_seconds=window_seconds,
                total_events=0,
                success_count=0,
                failure_count=0,
                success_rate=1.0,
                failure_velocity_per_min=0.0,
                timeout_count=0,
                timeout_ratio=0.0,
            )

        successes = sum(1 for e in window_events if e.is_success)
        failures = total - successes
        timeouts = sum(1 for e in window_events if e.is_timeout)

        sr = successes / total
        minutes = max(window_seconds / 60.0, 1.0)
        velocity = failures / minutes
        timeout_ratio = timeouts / total

        return SlidingWindowStats(
            window_seconds=window_seconds,
            total_events=total,
            success_count=successes,
            failure_count=failures,
            success_rate=sr,
            failure_velocity_per_min=velocity,
            timeout_count=timeouts,
            timeout_ratio=timeout_ratio,
        )

    def get_snapshot(
        self,
        rail_id: str,
        observation_timestamp: dt.datetime | None = None,
    ) -> RailHealthSnapshot:
        """Returns point-in-time health metrics and classification for a single rail."""
        ref_dt = observation_timestamp or dt.datetime.now(dt.UTC)
        ref_ts = ref_dt.timestamp()
        events = self._events.get(rail_id, [])

        w1 = self._compute_window(events, 60, ref_ts)
        w5 = self._compute_window(events, 300, ref_ts)
        w15 = self._compute_window(events, 900, ref_ts)

        # Check consecutive timeouts at the tail of the stream
        recent_events = [e for e in events if e.timestamp <= ref_ts]
        consecutive_timeouts = 0
        for e in reversed(recent_events):
            if e.is_timeout:
                consecutive_timeouts += 1
            else:
                break

        # State determination
        is_down = (
            w5.success_rate < self.DEGRADED_MIN_SR
            or consecutive_timeouts >= self.CONSECUTIVE_TIMEOUT_THRESHOLD
        )
        is_degraded = (
            w5.success_rate < self.HEALTHY_MIN_SR
            or w1.success_rate < self.DEGRADED_MIN_SR
        )

        if w5.total_events < self.MIN_EVENTS_FOR_CLASSIFICATION:
            state = RailState.HEALTHY
        elif is_down:
            state = RailState.DOWN
        elif is_degraded:
            state = RailState.DEGRADED
        else:
            state = RailState.HEALTHY

        return RailHealthSnapshot(
            rail_id=rail_id,
            state=state,
            success_rate_5m=w5.success_rate,
            failure_velocity_5m=w5.failure_velocity_per_min,
            window_1m=w1,
            window_5m=w5,
            window_15m=w15,
            last_evaluated_at=ref_dt,
        )

    def get_all_snapshots(
        self,
        observation_timestamp: dt.datetime | None = None,
    ) -> list[RailHealthSnapshot]:
        """Health snapshots for every rail this tracker has actually observed.

        Observed means at least one ingested attempt named the rail. Rails with
        no traffic are absent, and an empty matrix means nothing has been
        ingested yet.

        This previously unioned the observed rails with a hardcoded set of
        seven: ``HDFC|UPI|RAZORPAY``, ``SBI|UPI|RAZORPAY``,
        ``ICICI|CARD|RAZORPAY`` and so on. Because those rails had no events,
        every one of them reported ``HEALTHY`` with a five-minute success rate
        of 1.0 -- so a fresh install served an operator seven named real banks,
        all of them perfect, none of them measured. That is an invented claim
        about real institutions, which
        ``docs/adr/0006-numbers-policy.md`` prohibits, and it is a dangerous
        one: "healthy" is precisely the reading that would stop someone
        investigating.

        The console renders an empty matrix as "no rails observed yet", and
        says explicitly that this is an absence of data rather than an
        all-clear. That is the honest presentation of nothing, and it is the
        one the sensing service should make possible.
        """
        ref_dt = observation_timestamp or dt.datetime.now(dt.UTC)
        return [self.get_snapshot(rail_id, ref_dt) for rail_id in sorted(self._events)]


# Singleton tracker for active in-memory health sensing
default_rail_tracker = RailHealthTracker()
