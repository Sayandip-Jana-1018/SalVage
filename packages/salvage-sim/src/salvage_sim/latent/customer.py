"""Customers, and the balance cycle that drives insufficient-funds declines.

The salary cycle is the reason this package exists in the form it does. An
insufficient-funds decline and an issuer outage arrive at the merchant looking
identical -- both are "payment failed" -- but the correct response to each is
the opposite of the other. An outage wants a **different rail, immediately**.
An empty account wants the **same rail, after payday**; switching rails does
nothing at all, because the money is not there whichever way you ask for it.

That asymmetry is built in here deliberately, and it is the central thing a
policy has to learn. It is also why the counterfactual labels are worth
generating: without them, an evaluation cannot tell a policy that waited three
days for the right reason from one that waited three days and got lucky.

Balance is modelled as a probability, not an amount. Tracking a real balance
would mean modelling income, spending, and every other debit hitting the
account, which is a great deal of machinery to arrive back at the same place:
the probability that this particular debit bounces. The curve below is the
part that matters, and it is honest about being a reduced form.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass

from salvage_sim.calibration import Calibration, PaymentMethod
from salvage_sim.clock import SimClock
from salvage_sim.rng import KeyedRandom


@dataclass(frozen=True, slots=True)
class Customer:
    """One customer's latent, time-invariant properties.

    Everything time-varying is computed from these plus ``t``, which keeps the
    customer a pure function of its identity and makes it queryable at any
    future time for counterfactual purposes.
    """

    customer_id: str
    merchant_id: str
    payday: int
    """Local day of month, 1-28, on which this customer is paid."""

    balance_pressure: float
    """Multiplier on the salary-cycle curve. Above 1.0 is a chronically
    tight account, below 1.0 a comfortable one."""

    opted_out: bool
    """Has asked not to be contacted. The policy may still act on the payment
    itself; it may not send this person a message."""

    preferred_method: PaymentMethod
    preferred_issuer: str


class CustomerPopulation:
    """The customers of every merchant in the run.

    Customers are generated lazily and cached. A thirty-day run over a dozen
    merchants touches a small fraction of a twelve-thousand-strong customer
    base, and materialising all of them up front would cost more memory and
    time than the simulation itself.
    """

    def __init__(self, calibration: Calibration, clock: SimClock, rng: KeyedRandom) -> None:
        self._calibration = calibration
        self._clock = clock
        self._rng = rng
        self._cache: dict[str, Customer] = {}

        cycle = calibration.customers.salary_cycle
        weights = cycle.normalised_payday_weights()
        self._payday_days = tuple(sorted(weights))
        self._payday_weights = tuple(weights[day] for day in self._payday_days)

        self._method_names = tuple(sorted(calibration.payment_methods))
        # emandate is excluded from customer preference: a customer does not
        # "prefer" a mandate debit, the mandate schedules it. Weighting by
        # traffic_share does that automatically, since emandate's share is
        # required to be zero.
        self._method_weights = tuple(
            calibration.payment_methods[m].traffic_share for m in self._method_names
        )
        self._issuer_ids = tuple(issuer.id for issuer in calibration.issuers)
        self._issuer_weights = tuple(issuer.traffic_share for issuer in calibration.issuers)

    def customer(self, merchant_id: str, index: int) -> Customer:
        customer_id = f"{merchant_id}_cust_{index:07d}"
        cached = self._cache.get(customer_id)
        if cached is not None:
            return cached

        rng = self._rng
        payday = self._payday_days[
            rng.choice_index(self._payday_weights, "latent.customer.payday", customer_id)
        ]
        pressure = rng.lognormal(
            1.0,
            self._calibration.customers.salary_cycle.per_customer_gsd,
            "latent.customer.pressure",
            customer_id,
        )
        opted_out = rng.bernoulli(
            self._calibration.customers.opt_out_rate, "latent.customer.optout", customer_id
        )
        method = self._method_names[
            rng.choice_index(self._method_weights, "latent.customer.method", customer_id)
        ]
        issuer = self._pick_issuer_for(method, customer_id)

        customer = Customer(
            customer_id=customer_id,
            merchant_id=merchant_id,
            payday=payday,
            balance_pressure=pressure,
            opted_out=opted_out,
            preferred_method=method,
            preferred_issuer=issuer,
        )
        self._cache[customer_id] = customer
        return customer

    def _pick_issuer_for(self, method: PaymentMethod, customer_id: str) -> str:
        """Choose an issuer that actually carries the method.

        Restricting the weights to supporting issuers and renormalising is
        correct here, unlike in the calibration loader: the file's shares are
        over all traffic, and conditioning on the method is a real conditional
        probability rather than papering over a typo.
        """
        eligible = [
            (issuer.id, issuer.traffic_share)
            for issuer in self._calibration.issuers
            if method in issuer.supported_methods
        ]
        if not eligible:
            # The calibration loader rejects this configuration, so reaching
            # here means the loader's invariant has been broken.
            raise RuntimeError(f"no issuer carries {method!r}")
        ids = tuple(i for i, _ in eligible)
        weights = tuple(w for _, w in eligible)
        return ids[self._rng.choice_index(weights, "latent.customer.issuer", customer_id, method)]

    def insufficient_funds_probability(self, customer: Customer, t: float) -> float:
        """P(this customer's account cannot cover a debit) at time ``t``.

        The curve is a linear interpolation between two anchors: a trough just
        after payday, and a peak ``days_before_payday_at_peak`` days before the
        next one. A sinusoid was the obvious alternative and is wrong in a way
        that matters -- it is symmetric, and the real shape is not. Balance
        recovers abruptly on payday and drains gradually over the weeks after,
        so the descent from peak to trough should be a cliff and the climb back
        should be a slope. Two linear segments say that plainly.

        Returns a probability, clipped to [0, 1] because ``balance_pressure``
        is an unbounded lognormal multiplier and a chronically tight customer
        can push the peak past one.
        """
        cycle = self._calibration.customers.salary_cycle
        days_to_payday = self._clock.days_until_next_payday(t, customer.payday)
        cycle_length = self._cycle_length_days(t)
        peak_offset = float(cycle.days_before_payday_at_peak)

        if days_to_payday <= peak_offset:
            # Between the peak and payday. Balance is at its worst and stays
            # there; the account does not get better in the last two days.
            base = cycle.peak_rate
        else:
            # Climbing from the post-payday trough towards the peak. Fraction
            # of the way through the climb, where 0.0 is just after payday.
            climb = cycle_length - peak_offset
            progress = (cycle_length - days_to_payday) / climb if climb > 0.0 else 1.0
            progress = min(max(progress, 0.0), 1.0)
            base = cycle.trough_rate + (cycle.peak_rate - cycle.trough_rate) * progress

        return min(max(base * customer.balance_pressure, 0.0), 1.0)

    def _cycle_length_days(self, t: float) -> float:
        """Length of the pay cycle containing ``t``, in days.

        Not a constant 30: the months are not equal, and using 30 everywhere
        would make the curve in February peak a day early and in July a day
        late. Derived from the calendar rather than assumed.
        """
        local = self._clock.local(t)
        return float(calendar.monthrange(local.year, local.month)[1])

    def would_be_declined_for_funds(
        self, customer: Customer, t: float, attempt_key: str
    ) -> bool:
        """The latent draw: does this account cover this debit at this moment?

        Keyed by ``attempt_key`` rather than drawn sequentially, so the same
        question asked twice gives the same answer, and asking it about a
        hypothetical future attempt does not disturb the real timeline. That is
        what makes the counterfactual labels well defined.
        """
        return self._rng.bernoulli(
            self.insufficient_funds_probability(customer, t),
            "latent.customer.funds",
            attempt_key,
        )
