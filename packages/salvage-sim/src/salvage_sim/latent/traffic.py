"""When payments are attempted: the arrival processes.

Two sources, and they are genuinely different processes rather than one with a
flag set.

**Checkouts** arrive as an inhomogeneous Poisson process. The rate varies with
the local hour, the weekday, and any festival window in progress. Poisson is
the right family here because checkouts are independent decisions by unrelated
people; what makes the stream non-trivial is that the rate moves, not that the
arrivals interact.

**Mandate debits** are not a random process at all. They are a schedule: a
debit falls due every ``debit_interval_days`` from the mandate's first debit,
and it falls due whether or not the mandate is still alive. Modelling them as
Poisson would erase the single most exploitable structure in recurring
payments -- that you know the exact instant of the next attempt in advance.

Generation is by thinning
-------------------------

Candidate arrivals are drawn at the maximum rate over the horizon and then
accepted with probability ``rate(t) / rate_max``. This is Lewis and Shedler's
thinning algorithm, and it is exact: the accepted points are distributed
exactly as an inhomogeneous Poisson process with the target rate, with no
discretisation of time into buckets. Bucketing would have been easier and
would have quietly quantised every arrival onto an hour boundary, which shows
up immediately in any inter-arrival analysis.
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass

import numpy as np

from salvage_sim.calibration import Calibration, PaymentMethod
from salvage_sim.clock import SECONDS_PER_DAY, SimClock
from salvage_sim.latent.customer import Customer
from salvage_sim.latent.mandate import Mandate
from salvage_sim.latent.outcome import Rail
from salvage_sim.latent.world import Merchant, World

# Resolution at which the time-varying rate is scanned to find its maximum for
# thinning. Fifteen minutes is far finer than any feature of the rate curve,
# whose fastest component is hourly, so the bound it produces is tight. A
# loose bound would still be correct -- thinning only requires an upper bound
# -- but would waste candidate draws.
_RATE_SCAN_SECONDS = 900.0


@dataclass(frozen=True, slots=True)
class Order:
    """One order, before any attempt has been made against it."""

    order_id: str
    merchant_id: str
    customer: Customer | None
    created_at: float
    amount_paise: int
    rail: Rail
    mandate: Mandate | None

    @property
    def is_recurring(self) -> bool:
        return self.mandate is not None


class RateCurve:
    """The deterministic multiplier on baseline traffic at any time.

    Separated out because it is the piece the charts plot and the tests
    assert against, and because it is pure: no randomness, no state.
    """

    def __init__(self, calibration: Calibration, clock: SimClock) -> None:
        self._clock = clock
        self._hour = calibration.traffic.normalised_hour_weights()
        self._weekday = calibration.traffic.normalised_day_weights()
        self._festivals = calibration.traffic.festival_windows

    def multiplier(self, t: float) -> float:
        local = self._clock.local(t)
        return (
            self._hour[local.hour]
            * self._weekday[local.weekday()]
            * self.festival_multiplier(t)
        )

    def festival_multiplier(self, t: float) -> float:
        """Triangular ramp: up to the peak at the window's midpoint, then down.

        A rectangular window would be simpler and wrong in a way that matters
        for change-point detection in Phase 3: a step change in volume is
        trivially detectable, while a ramp is not, and a detector tuned on
        steps would fall over on the real thing. Sale traffic builds and
        decays; it does not switch on.
        """
        local = self._clock.local(t)
        best = 1.0
        for window in self._festivals:
            start = local.replace(
                month=window.start_month,
                day=window.start_day,
                hour=0,
                minute=0,
                second=0,
                microsecond=0,
            )
            elapsed_days = (local - start).total_seconds() / SECONDS_PER_DAY
            if not 0.0 <= elapsed_days <= window.duration_days:
                continue
            half = window.duration_days / 2.0
            # Distance from the midpoint, normalised to [0, 1] at the edges.
            distance = abs(elapsed_days - half) / half if half > 0.0 else 0.0
            multiplier = 1.0 + (window.peak_multiplier - 1.0) * max(0.0, 1.0 - distance)
            best = max(best, multiplier)
        return best

    def max_multiplier(self, horizon: float) -> float:
        """An upper bound on :meth:`multiplier` over ``[0, horizon]``.

        Scanned rather than computed analytically. The curve is a product of
        three factors whose maxima do not necessarily coincide -- a festival
        peak on a Tuesday afternoon is not the product of the three maxima --
        so taking that product would be a valid but needlessly loose bound.
        A small safety margin covers the gap between scan points.
        """
        samples = int(horizon / _RATE_SCAN_SECONDS) + 1
        peak = max(self.multiplier(i * _RATE_SCAN_SECONDS) for i in range(samples + 1))
        return peak * 1.05


class TrafficGenerator:
    """Produces the order stream for a run."""

    def __init__(self, world: World) -> None:
        self._world = world
        self._calibration = world.calibration
        self._curve = RateCurve(world.calibration, world.clock)
        self._method_names: tuple[PaymentMethod, ...] = tuple(
            sorted(world.calibration.payment_methods)
        )
        self._method_weights = tuple(
            world.calibration.payment_methods[m].traffic_share for m in self._method_names
        )

    @property
    def rate_curve(self) -> RateCurve:
        return self._curve

    def orders(self) -> list[Order]:
        """Every order in the run, sorted by creation time.

        Materialised as a list rather than streamed. A thirty-day run over a
        dozen merchants is a few hundred thousand orders, which is tens of
        megabytes -- and the journeys have to be simulated in time order
        anyway, so a generator would only move the sort somewhere less
        obvious.
        """
        orders: list[Order] = []
        for merchant in self._world.merchants:
            orders.extend(self._checkout_orders(merchant))
            orders.extend(self._mandate_orders(merchant))
        orders.sort(key=lambda order: (order.created_at, order.order_id))
        return orders

    def _checkout_orders(self, merchant: Merchant) -> list[Order]:
        horizon = self._world.horizon_seconds
        base_per_second = (
            self._calibration.traffic.base_attempts_per_merchant_per_day
            * merchant.volume_multiplier
            / SECONDS_PER_DAY
        )
        peak_multiplier = self._curve.max_multiplier(horizon)
        peak_rate = base_per_second * peak_multiplier

        generator = self._world.rng.generator("latent.traffic.checkout", merchant.merchant_id)
        expected_candidates = peak_rate * horizon
        candidate_count = int(generator.poisson(expected_candidates))
        candidates = np.sort(generator.uniform(0.0, horizon, size=candidate_count))
        acceptance = generator.uniform(0.0, 1.0, size=candidate_count)

        customer_count = self._world.customers_per_merchant(merchant)
        orders: list[Order] = []
        for index, (t, u) in enumerate(zip(candidates, acceptance, strict=True)):
            if u * peak_multiplier > self._curve.multiplier(float(t)):
                continue
            orders.append(self._build_checkout(merchant, float(t), index, customer_count))
        return orders

    def _build_checkout(
        self, merchant: Merchant, t: float, index: int, customer_count: int
    ) -> Order:
        rng = self._world.rng
        order_id = f"ord_{merchant.merchant_id}_{index:08d}"

        if rng.bernoulli(
            self._calibration.customers.guest_checkout_rate, "latent.traffic.guest", order_id
        ):
            customer = None
            method = self._method_names[
                rng.choice_index(self._method_weights, "latent.traffic.method", order_id)
            ]
            issuer_id = self._issuer_for(method, order_id)
        else:
            customer_index = int(
                rng.uniform("latent.traffic.customer", order_id) * customer_count
            )
            customer = self._world.customers.customer(merchant.merchant_id, customer_index)
            # A customer usually reaches for the same instrument, but not
            # always; a fixed preference would make the per-customer method
            # mix degenerate and remove a real source of variation.
            if rng.bernoulli(
                self._calibration.customers.self_retry.method_switch_rate,
                "latent.traffic.deviate",
                order_id,
            ):
                method = self._method_names[
                    rng.choice_index(self._method_weights, "latent.traffic.method", order_id)
                ]
                issuer_id = self._issuer_for(method, order_id)
            else:
                method = customer.preferred_method
                issuer_id = (
                    customer.preferred_issuer
                    if self._world.supports(customer.preferred_issuer, method)
                    else self._issuer_for(method, order_id)
                )

        method_settings = self._calibration.payment_methods[method]
        amount = rng.lognormal(
            method_settings.amount_median_rupees,
            method_settings.amount_gsd,
            "latent.traffic.amount",
            order_id,
        )
        return Order(
            order_id=order_id,
            merchant_id=merchant.merchant_id,
            customer=customer,
            created_at=t,
            # Paise, and never below one: the event contract requires a
            # positive amount, and a zero-value payment cannot fail.
            amount_paise=max(1, round(amount * 100)),
            rail=Rail(issuer_id=issuer_id, method=method),
            mandate=None,
        )

    def _issuer_for(self, method: PaymentMethod, key: str) -> str:
        eligible = [
            (issuer.id, issuer.traffic_share)
            for issuer in self._calibration.issuers
            if method in issuer.supported_methods
        ]
        ids = tuple(i for i, _ in eligible)
        weights = tuple(w for _, w in eligible)
        return ids[self._world.rng.choice_index(weights, "latent.traffic.issuer", key, method)]

    def _mandate_orders(self, merchant: Merchant) -> list[Order]:
        """Scheduled debits for every mandate this merchant holds.

        Enumerating the whole customer base is unavoidable -- a mandate is a
        property of a customer, and there is no index from mandates back to
        customers that does not first walk the customers. It is cheap because
        :meth:`MandateBook.holds_mandate` needs only the id, so the ~86% of
        customers with no mandate cost one hash each and are never built.
        """
        horizon = self._world.horizon_seconds
        orders: list[Order] = []
        for index in range(self._world.customers_per_merchant(merchant)):
            customer_id = f"{merchant.merchant_id}_cust_{index:07d}"
            if not self._world.mandates.holds_mandate(customer_id):
                continue
            customer = self._world.customers.customer(merchant.merchant_id, index)
            mandate = self._world.mandates.create_for(customer)
            issuer_id = (
                customer.preferred_issuer
                if self._world.supports(customer.preferred_issuer, "emandate")
                else self._issuer_for("emandate", customer_id)
            )
            for sequence, t in enumerate(mandate.debit_times(horizon)):
                orders.append(
                    Order(
                        order_id=f"ord_{mandate.mandate_id}_{sequence:04d}",
                        merchant_id=merchant.merchant_id,
                        customer=customer,
                        created_at=t,
                        amount_paise=mandate.amount_paise,
                        rail=Rail(issuer_id=issuer_id, method="emandate"),
                        mandate=mandate,
                    )
                )
        return orders


def hour_histogram(orders: list[Order], clock: SimClock) -> list[int]:
    """Orders per local hour of day. Used by the charts and by the tests."""
    counts = [0] * 24
    for order in orders:
        counts[clock.local_hour(order.created_at)] += 1
    return counts


def daily_counts(orders: list[Order], horizon_seconds: float) -> list[int]:
    """Orders per simulation day. Used to show the festival ramp."""
    days = int(horizon_seconds // SECONDS_PER_DAY) + 1
    boundaries = [day * SECONDS_PER_DAY for day in range(days + 1)]
    counts = [0] * days
    for order in orders:
        index = bisect.bisect_right(boundaries, order.created_at) - 1
        if 0 <= index < days:
            counts[index] += 1
    return counts
