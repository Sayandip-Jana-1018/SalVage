"""The insufficient-funds rate has to move with the pay cycle.

If it did not, "wait until Friday" would be indistinguishable from "wait
forty-eight hours", and the most interesting recovery action in Indian
recurring payments would carry no signal at all.
"""

from __future__ import annotations

import statistics

from salvage_sim.calibration import Calibration
from salvage_sim.clock import SECONDS_PER_DAY, SECONDS_PER_HOUR, SimClock
from salvage_sim.latent.customer import Customer, CustomerPopulation
from salvage_sim.latent.health import RailHealth
from salvage_sim.latent.outcome import OutcomeModel
from salvage_sim.rng import KeyedRandom


def population(calibration: Calibration, clock: SimClock) -> CustomerPopulation:
    return CustomerPopulation(calibration, clock, KeyedRandom(99))


def fixed_customer(payday: int) -> Customer:
    """A customer with no per-customer variation, so the curve is visible.

    ``balance_pressure`` is pinned to 1.0. Sampling real customers would work
    too but would need far more of them to see the shape through the lognormal
    spread, and the shape is what is under test.
    """
    return Customer(
        customer_id="test_customer",
        merchant_id="merchant_000",
        payday=payday,
        balance_pressure=1.0,
        opted_out=False,
        preferred_method="upi",
        preferred_issuer="issuer_alpha",
    )


def test_the_rate_is_lowest_just_after_payday(
    calibration: Calibration, clock: SimClock
) -> None:
    people = population(calibration, clock)
    customer = fixed_customer(payday=1)

    # Sample hourly across a full cycle and locate the minimum, rather than
    # asserting it lands at hour zero. It does not: t=0 is midnight UTC, which
    # is 05:30 local, so the run already starts five and a half hours into the
    # cycle. Asserting a position would be asserting the timezone offset.
    hours = 31 * 24
    curve = [
        people.insufficient_funds_probability(customer, hour * SECONDS_PER_HOUR)
        for hour in range(hours)
    ]
    trough_hour = curve.index(min(curve))

    # The claim under test is about the cycle, not the clock: at the trough,
    # payday must have just passed, so the next one is nearly a full cycle away.
    days_to_next = clock.days_until_next_payday(trough_hour * SECONDS_PER_HOUR, 1)
    assert days_to_next > 27.0, (
        f"the balance curve troughs {days_to_next:.2f} days before the next payday; "
        "it should be lowest immediately after one"
    )


def test_the_rate_peaks_shortly_before_the_next_payday(
    calibration: Calibration, clock: SimClock
) -> None:
    people = population(calibration, clock)
    customer = fixed_customer(payday=1)
    cycle = calibration.customers.salary_cycle

    peak_day = None
    best = -1.0
    for day in range(31):
        t = day * SECONDS_PER_DAY + 12 * SECONDS_PER_HOUR
        value = people.insufficient_funds_probability(customer, t)
        if value > best:
            best = value
            peak_day = day

    assert peak_day is not None
    days_to_payday = 31 - peak_day
    assert days_to_payday <= cycle.days_before_payday_at_peak + 2, (
        f"the curve peaks {days_to_payday} days before payday, but "
        f"days_before_payday_at_peak is {cycle.days_before_payday_at_peak}"
    )
    assert best > cycle.trough_rate * 2, (
        f"peak {best:.4f} is barely above the trough {cycle.trough_rate:.4f}; the "
        "cycle carries almost no signal"
    )


def test_the_curve_is_bounded_by_the_calibrated_anchors(
    calibration: Calibration, clock: SimClock
) -> None:
    people = population(calibration, clock)
    customer = fixed_customer(payday=15)
    cycle = calibration.customers.salary_cycle

    values = [
        people.insufficient_funds_probability(customer, hour * SECONDS_PER_HOUR)
        for hour in range(31 * 24)
    ]
    assert min(values) >= cycle.trough_rate - 1e-9
    assert max(values) <= cycle.peak_rate + 1e-9


def test_paydays_differ_between_customers(calibration: Calibration, clock: SimClock) -> None:
    """A population where everyone is paid on the same day is not a population.

    Salary-cycle features are only useful because customers are out of phase
    with each other; if they were not, day-of-month alone would explain
    everything and there would be nothing per-customer to learn.
    """
    people = population(calibration, clock)
    paydays = {people.customer("merchant_000", i).payday for i in range(500)}
    assert len(paydays) >= 4, f"only paydays {sorted(paydays)} occur across 500 customers"


def test_balance_pressure_varies_across_customers(
    calibration: Calibration, clock: SimClock
) -> None:
    people = population(calibration, clock)
    pressures = [people.customer("merchant_000", i).balance_pressure for i in range(500)]
    assert statistics.stdev(pressures) > 0.2, (
        "balance_pressure is nearly constant; per_customer_gsd is having no effect "
        "and every customer has the same balance risk"
    )


def test_the_rate_is_a_step_function_within_a_balance_bucket(
    calibration: Calibration, clock: SimClock
) -> None:
    """Two attempts minutes apart must see the same account.

    The probability curve is continuous, but the *draw* is bucketed. This
    checks the bucketing directly, because it is what makes an immediate retry
    correctly futile after an insufficient-funds decline.
    """
    rng = KeyedRandom(99)
    people = population(calibration, clock)
    health = RailHealth(calibration, rng, 40 * SECONDS_PER_DAY)
    model = OutcomeModel(calibration, health, people, rng)

    customer = people.customer("merchant_000", 3)
    bucket = calibration.customers.salary_cycle.balance_state_hours * SECONDS_PER_HOUR
    base = 10 * SECONDS_PER_DAY

    within = [
        model._balance_short(customer, base + fraction * bucket)
        for fraction in (0.01, 0.25, 0.5, 0.75, 0.99)
    ]
    assert len(set(within)) == 1, (
        "the balance answer changed within one bucket; an immediate retry would "
        "then clear an insufficient-funds decline by luck"
    )
