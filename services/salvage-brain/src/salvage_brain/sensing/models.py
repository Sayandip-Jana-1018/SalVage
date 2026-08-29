"""Data models for real-time payment rail health sensing."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from enum import StrEnum


class RailState(StrEnum):
    """Real-time operational health state of a payment rail."""

    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    DOWN = "DOWN"


@dataclass(frozen=True, slots=True)
class SlidingWindowStats:
    """Aggregated metrics over a specific time window."""

    window_seconds: int
    total_events: int
    success_count: int
    failure_count: int
    success_rate: float
    failure_velocity_per_min: float
    timeout_count: int
    timeout_ratio: float


@dataclass(frozen=True, slots=True)
class RailHealthSnapshot:
    """Point-in-time health snapshot of a payment rail."""

    rail_id: str
    state: RailState
    success_rate_5m: float
    failure_velocity_5m: float
    window_1m: SlidingWindowStats
    window_5m: SlidingWindowStats
    window_15m: SlidingWindowStats
    last_evaluated_at: dt.datetime
