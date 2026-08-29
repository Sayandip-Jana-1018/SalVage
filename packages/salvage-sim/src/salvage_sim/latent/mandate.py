"""Recurring mandates and their lifecycle.

Mandates matter here out of proportion to their share of traffic, because they
are the cleanest source of a **permanently unrecoverable** failure. A debit
against an expired or revoked mandate will fail on the first attempt, on the
fiftieth, and on any rail. Every retry is pure cost: a gateway fee, a line in
the customer's statement, and on some rails a hard decline that counts against
the merchant.

That gives the evaluation something with teeth. A policy that retries
everything will look acceptable on aggregate recovery and terrible on cost per
recovered rupee, and the gap between those two is only visible because the
simulator knows which failures were never going to be recovered. A dataset
without permanent failures in it would flatter every retry policy equally.

The three states are distinguished on purpose:

``ACTIVE``   the mandate is live; a debit may still fail for balance reasons,
             and that failure *is* recoverable by waiting for payday.
``EXPIRED``  the mandate reached the end of its registered term.
``REVOKED``  the customer cancelled it. Retrying is not merely futile, it is
             the wrong thing to do to someone who has said no.

Expiry and revocation are both permanent and both mean "stop", but they are
kept apart because they are not the same fact about the customer, and Phase 3's
failure taxonomy will want to say so.
"""

from __future__ import annotations

import enum
import math
from dataclasses import dataclass

from salvage_sim.calibration import Calibration
from salvage_sim.clock import SECONDS_PER_DAY, SimClock
from salvage_sim.latent.customer import Customer
from salvage_sim.rng import KeyedRandom


class MandateState(enum.StrEnum):
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"


@dataclass(frozen=True, slots=True)
class Mandate:
    """One mandate, with its whole life fixed at creation.

    ``expires_at`` and ``revoked_at`` are drawn once, up front, rather than
    decided as the simulation passes them. The same reasoning as the health
    trajectories: a label asks whether a debit three days from now would
    succeed, and that question has no answer unless the mandate's future is
    already determined. Deciding revocation lazily would make the answer
    depend on whether anyone had asked yet.
    """

    mandate_id: str
    customer_id: str
    merchant_id: str
    created_at: float
    expires_at: float
    revoked_at: float | None
    amount_paise: int
    first_debit_at: float
    interval_seconds: float

    def state_at(self, t: float) -> MandateState:
        """State at ``t``. Revocation wins over expiry if both have passed.

        A revoked mandate that later reaches its expiry date is still revoked:
        the customer's decision is the fact worth reporting, and reporting it
        as an expiry would lose the signal that they actively said no.
        """
        if self.revoked_at is not None and t >= self.revoked_at:
            return MandateState.REVOKED
        if t >= self.expires_at:
            return MandateState.EXPIRED
        return MandateState.ACTIVE

    def is_permanently_dead_at(self, t: float) -> bool:
        return self.state_at(t) is not MandateState.ACTIVE

    def debit_times(self, horizon: float) -> tuple[float, ...]:
        """Scheduled debit times within ``[0, horizon]``.

        Debits are scheduled while the mandate is live and are *not* filtered
        by state here. A debit attempted the day after revocation is exactly
        the event this package needs to produce: the schedule and the mandate's
        status are two different systems, and in the real world they disagree
        for a while. Filtering here would delete the most instructive failures
        in the dataset.
        """
        times: list[float] = []
        t = self.first_debit_at
        while t <= horizon:
            if t >= 0.0:
                times.append(t)
            t += self.interval_seconds
        return tuple(times)


class MandateBook:
    """Every mandate in the run, generated up front.

    Unlike customers these are materialised eagerly: the debit schedule is one
    of the arrival processes, so the whole book has to be enumerated before
    traffic generation can begin.
    """

    def __init__(
        self,
        calibration: Calibration,
        clock: SimClock,
        rng: KeyedRandom,
        horizon_seconds: float,
    ) -> None:
        self._calibration = calibration
        self._clock = clock
        self._rng = rng
        self._horizon = horizon_seconds
        self._by_id: dict[str, Mandate] = {}
        self._by_customer: dict[str, Mandate] = {}

    def holds_mandate(self, customer_id: str) -> bool:
        """Does this customer hold a mandate?

        Takes an id rather than a :class:`Customer` so the mandate book can be
        enumerated over a merchant's whole customer base without constructing
        every customer first. At twelve thousand customers a merchant, that is
        the difference between one keyed draw per customer and six.
        """
        return self._rng.bernoulli(
            self._calibration.mandates.share_of_customers,
            "latent.mandate.holds",
            customer_id,
        )

    def create_for(self, customer: Customer) -> Mandate:
        """The mandate held by ``customer``, created on first request.

        Mandates predate the simulation window. ``created_at`` is negative --
        somewhere in the past, uniformly across one mean lifetime -- because a
        run that began with every mandate freshly registered would contain no
        expiries at all until the horizon exceeded the mean lifetime, which for
        a thirty-day run over a four-hundred-day term means never. Starting
        mid-life is what produces expiries inside the window.
        """
        existing = self._by_customer.get(customer.customer_id)
        if existing is not None:
            return existing

        rng = self._rng
        settings = self._calibration.mandates
        key = customer.customer_id
        mean_lifetime = settings.mean_lifetime_days * SECONDS_PER_DAY

        age = rng.uniform("latent.mandate.age", key) * mean_lifetime
        created_at = -age
        lifetime = rng.exponential(mean_lifetime, "latent.mandate.lifetime", key)
        expires_at = created_at + lifetime

        # Revocation as a constant hazard. Converting a monthly probability to
        # a rate rather than treating it as one, because "2.2% a month" applied
        # to a four-hundred-day mandate is not 2.2% times thirteen.
        monthly = settings.monthly_revocation_rate
        revoked_at: float | None = None
        if monthly > 0.0:
            rate_per_second = -math.log(1.0 - monthly) / (30.0 * SECONDS_PER_DAY)
            time_to_revoke = rng.exponential(1.0 / rate_per_second, "latent.mandate.revoke", key)
            candidate = created_at + time_to_revoke
            if candidate < expires_at:
                revoked_at = candidate

        amount = rng.lognormal(
            self._calibration.payment_methods["emandate"].amount_median_rupees,
            self._calibration.payment_methods["emandate"].amount_gsd,
            "latent.mandate.amount",
            key,
        )
        interval = settings.debit_interval_days * SECONDS_PER_DAY
        # Spread first debits across the cycle so the whole book does not fire
        # on the same day, which would produce an implausible sawtooth in the
        # recurring traffic and make any daily aggregate useless.
        offset = rng.uniform("latent.mandate.offset", key) * settings.debit_day_spread * interval

        mandate = Mandate(
            mandate_id=f"mdt_{customer.merchant_id}_{key.rsplit('_', 1)[-1]}",
            customer_id=customer.customer_id,
            merchant_id=customer.merchant_id,
            created_at=created_at,
            expires_at=expires_at,
            revoked_at=revoked_at,
            amount_paise=max(1, round(amount * 100)),
            first_debit_at=offset,
            interval_seconds=interval,
        )
        self._by_id[mandate.mandate_id] = mandate
        self._by_customer[customer.customer_id] = mandate
        return mandate

    def get(self, mandate_id: str) -> Mandate:
        return self._by_id[mandate_id]
