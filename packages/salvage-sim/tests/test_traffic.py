"""Arrivals follow the configured shape, and the festival ramp is a ramp.

Traffic shape matters more than it looks. Phase 3 has to detect change points
in failure rates, and a detector tuned against a step change falls over on a
gradual one. If the simulator's only volume excursion were a rectangle, the
detector would be tested against the easy case and shipped.
"""

from __future__ import annotations

import statistics

import pytest

from salvage_sim.calibration import Calibration
from salvage_sim.clock import SECONDS_PER_DAY, SECONDS_PER_HOUR, SimClock
from salvage_sim.latent.traffic import (
    Order,
    RateCurve,
    TrafficGenerator,
    daily_counts,
    hour_histogram,
)
from salvage_sim.latent.world import World
from salvage_sim.rng import KeyedRandom


@pytest.fixture(scope="module")
def orders(world: World) -> list[Order]:
    """The whole order stream, generated once for the module.

    Thirty days over two merchants is around a hundred thousand orders and
    takes several seconds to build. Every test below reads it and none mutates
    it, so regenerating per test was costing more than the rest of the suite
    put together.
    """
    return TrafficGenerator(world).orders()


@pytest.fixture(scope="module")
def checkouts(orders: list[Order]) -> list[Order]:
    return [order for order in orders if not order.is_recurring]


def test_the_hourly_shape_follows_the_configured_curve(
    checkouts: list[Order], calibration: Calibration, clock: SimClock
) -> None:
    orders = checkouts
    assert len(orders) > 20000, f"only {len(orders)} orders; the histogram is too sparse"

    counts = hour_histogram(orders, clock)
    weights = calibration.traffic.normalised_hour_weights()

    busiest_configured = max(range(24), key=lambda h: weights[h])
    quietest_configured = min(range(24), key=lambda h: weights[h])
    assert counts[busiest_configured] > counts[quietest_configured] * 3, (
        f"hour {busiest_configured} has {counts[busiest_configured]} orders and hour "
        f"{quietest_configured} has {counts[quietest_configured]}; the configured "
        "curve differs by far more than that"
    )

    # Rank correlation between configured weight and observed count. Spearman
    # rather than Pearson: the claim is that the ordering is reproduced, not
    # that the relationship is exactly linear after Poisson noise.
    order_by_weight = sorted(range(24), key=lambda h: weights[h])
    order_by_count = sorted(range(24), key=lambda h: counts[h])
    ranks_weight = {hour: rank for rank, hour in enumerate(order_by_weight)}
    ranks_count = {hour: rank for rank, hour in enumerate(order_by_count)}
    correlation = statistics.correlation(
        [ranks_weight[h] for h in range(24)], [ranks_count[h] for h in range(24)]
    )
    assert correlation > 0.9, f"hourly rank correlation only {correlation:.3f}"


def test_the_festival_window_is_a_ramp_not_a_step(
    calibration: Calibration, clock: SimClock
) -> None:
    curve = RateCurve(calibration, clock)
    window = calibration.traffic.festival_windows[0]

    # The default start is 1 October and the first window opens on the 18th.
    start_day = 17.0
    samples = [
        curve.festival_multiplier((start_day + step * 0.25) * SECONDS_PER_DAY)
        for step in range(int((window.duration_days + 2) * 4))
    ]
    peak = max(samples)
    assert peak > 1.5, f"festival peak multiplier only {peak:.2f}"
    assert peak <= window.peak_multiplier + 1e-9

    # Between the first sample above 1.0 and the peak there must be several
    # intermediate values. A step would jump straight from 1.0 to the peak.
    rising = [s for s in samples[: samples.index(peak)] if 1.0 < s < peak]
    assert len(rising) >= 3, (
        f"only {len(rising)} intermediate values on the way up; the window is "
        "behaving as a step change, which is the easy case for change detection"
    )


def test_festival_days_carry_more_traffic(checkouts: list[Order], world: World) -> None:
    per_day = daily_counts(checkouts, world.horizon_seconds)
    # The run starts on 1 October and the window opens on the 18th, so the
    # peak day is around index 20. Compare it against the first week.
    baseline = statistics.median(per_day[2:14])
    peak = max(per_day[16:26])
    assert peak > baseline * 1.8, (
        f"peak festival day {peak} versus baseline {baseline}; the multiplier is "
        "not reaching the traffic"
    )


def test_method_mix_matches_the_configured_shares(
    checkouts: list[Order], calibration: Calibration
) -> None:
    counts: dict[str, int] = {}
    for order in checkouts:
        counts[order.rail.method] = counts.get(order.rail.method, 0) + 1
    total = sum(counts.values())

    for method, settings in calibration.payment_methods.items():
        if settings.traffic_share == 0.0:
            assert counts.get(method, 0) == 0, f"{method} should carry no checkout traffic"
            continue
        observed = counts.get(method, 0) / total
        assert abs(observed - settings.traffic_share) < 0.05, (
            f"{method} share {observed:.3f}, configured {settings.traffic_share}"
        )


def test_every_order_is_on_a_rail_its_issuer_supports(orders: list[Order], world: World) -> None:
    """A rail nothing carries would have no health trajectory to look up."""
    for order in orders:
        assert world.supports(order.rail.issuer_id, order.rail.method), order


def test_recurring_orders_come_only_from_the_mandate_book(orders: list[Order]) -> None:
    recurring = [o for o in orders if o.is_recurring]
    assert recurring, "no recurring orders generated"
    for order in recurring:
        assert order.rail.method == "emandate"
        assert order.mandate is not None
        assert order.customer is not None, "a mandate debit always has a known customer"


def test_orders_are_sorted_in_time(orders: list[Order]) -> None:
    """Journeys are simulated in order, and the labels index off attempt times."""
    times = [order.created_at for order in orders]
    assert times == sorted(times)


def test_merchant_volumes_are_skewed(calibration: Calibration, clock: SimClock) -> None:
    """Equal-sized merchants would flatter the cross-tenant pooling of ADR-0007.

    Pooled rail health earns its keep on the merchants too small to see an
    outage in their own traffic. If every merchant were the same size, the
    feature would be measured on a population that does not need it.

    Built with its own twenty-merchant world rather than the shared two-merchant
    fixture: two draws from a lognormal can land close together by chance, and
    a test that fails on that is measuring the seed rather than the spread.
    """
    populous = World(
        calibration=calibration,
        clock=clock,
        rng=KeyedRandom(20260829),
        horizon_days=1.0,
        merchant_count=20,
    )
    multipliers = sorted(m.volume_multiplier for m in populous.merchants)
    assert multipliers[-1] > multipliers[0] * 4.0, (
        f"merchant volume multipliers span only {multipliers[0]:.2f} to "
        f"{multipliers[-1]:.2f}; merchant_volume_gsd is having little effect"
    )


def test_arrival_times_are_not_quantised(checkouts: list[Order]) -> None:
    """Thinning is exact; bucketing would pin arrivals to hour boundaries.

    Any inter-arrival analysis downstream would then be measuring the
    simulator's time grid rather than the traffic.
    """
    orders = checkouts[:5000]
    seconds_into_hour = {order.created_at % SECONDS_PER_HOUR for order in orders}
    assert len(seconds_into_hour) > len(orders) * 0.9, (
        "arrival times repeat within the hour far more than continuous times would"
    )
