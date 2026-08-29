"""Simulation time.

Internally, time is a float: seconds since the start of the run. Every latent
process, every arrival, every counterfactual offset is expressed that way,
because arithmetic on ``datetime`` in a hot loop is slow and because a
continuous-time Markov chain wants a real number, not a calendar.

The calendar still matters at the edges. The salary cycle turns on the local
day of month, the traffic curve on the local hour and weekday, and the emitted
event carries a UTC ISO-8601 timestamp. This module is the only place those
conversions happen.

Local means IST by default, from ``simulation.timezone``. Getting this wrong
would be quietly ruinous: an IST business day runs from 18:30 to 18:30 UTC, so
computing "day of month" in UTC would smear every payday across two days and
blunt the salary-cycle signal the models are meant to learn.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

SECONDS_PER_MINUTE = 60.0
SECONDS_PER_HOUR = 3600.0
SECONDS_PER_DAY = 86400.0


@dataclass(frozen=True, slots=True)
class SimClock:
    """Maps ``t`` in seconds-since-start onto the wall clock.

    Frozen because the mapping is part of the run's identity: shifting the
    start date halfway through would silently invalidate every timestamp
    already emitted.
    """

    start: datetime
    timezone: ZoneInfo

    def __post_init__(self) -> None:
        if self.start.tzinfo is None:
            raise ValueError("SimClock.start must be timezone-aware")

    @classmethod
    def create(cls, start: datetime, timezone: str) -> SimClock:
        return cls(start=start.astimezone(UTC), timezone=ZoneInfo(timezone))

    def utc(self, t: float) -> datetime:
        return self.start + timedelta(seconds=t)

    def local(self, t: float) -> datetime:
        return self.utc(t).astimezone(self.timezone)

    def iso(self, t: float) -> str:
        """ISO-8601 with a ``Z`` suffix, millisecond precision.

        The event contract declares ``format: date-time``. Python renders UTC
        as ``+00:00``; both are valid ISO-8601 and RFC 3339, but ``Z`` is what
        the rest of the payments world emits, and millisecond precision
        matches what a gateway actually reports rather than implying
        microsecond accuracy the simulator does not have.
        """
        moment = self.utc(t)
        return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"

    def local_hour(self, t: float) -> int:
        return self.local(t).hour

    def local_weekday(self, t: float) -> int:
        """Monday is 0, matching ``traffic.day_of_week_weights``."""
        return self.local(t).weekday()

    def local_day_of_month(self, t: float) -> int:
        return self.local(t).day

    def local_month(self, t: float) -> int:
        return self.local(t).month

    def days_until_next_payday(self, t: float, payday: int) -> float:
        """Days from ``t`` until the next occurrence of ``payday``, local.

        Returns a fractional number of days, so the salary-cycle curve is
        continuous rather than stepping once per midnight. A retry scheduled
        six hours before payday should see a materially different balance
        risk from one scheduled six hours after it, and a curve that only
        moved at midnight would miss that.

        ``payday`` is constrained to 1-28 by the calibration loader, so it
        occurs in every month and no clamping is needed here. The month-length
        lookup below is still required to know how far away the *next* one is.

        The roll-forward does wall-clock arithmetic on a zone-aware datetime.
        In a zone with daylight saving that can land on a local midnight which
        does not exist, shifting the answer by up to an hour. IST, the default,
        has no DST, and an hour's error in a quantity measured in days would
        not be material even where it applies.
        """
        local = self.local(t)
        target = local.replace(
            day=payday, hour=0, minute=0, second=0, microsecond=0, fold=0
        )
        if target <= local:
            # Roll into the following month. Building the date by hand rather
            # than adding 31 days, which would skip February entirely.
            year, month = local.year, local.month
            days_in_month = calendar.monthrange(year, month)[1]
            target = target + timedelta(days=days_in_month)
        return (target - local).total_seconds() / SECONDS_PER_DAY
