"""Outages are bursty and correlated, and that comes from the mechanism.

The specification asks for outages that cluster in time and that spread across
an issuer's methods, rather than independent per-attempt coin flips. Claiming
that in a docstring is easy. These tests measure it, and -- more importantly --
show it disappears when the mechanism responsible is switched off.

The control is the whole point. A test that only asserts "correlation is
positive" would pass on a model that hardcoded a correlated fudge factor.
Setting ``stress_rate_multiplier`` to 1.0 removes the coupling between the
issuer chain and its rails without changing anything else; if the correlation
survives that, it was not coming from where the design says it is.
"""

from __future__ import annotations

import statistics

import numpy as np
import pytest

from salvage_sim.calibration import Calibration
from salvage_sim.clock import SECONDS_PER_DAY, SECONDS_PER_HOUR
from salvage_sim.latent.health import IssuerState, RailHealth, RailState
from salvage_sim.rng import KeyedRandom

HORIZON_DAYS = 400.0
# Fifteen minutes. Fine enough to resolve outages whose mean length is half an
# hour, coarse enough that a four-hundred-day run is thirty-eight thousand
# points per rail rather than a hundred and fifteen thousand.
SAMPLE_SECONDS = 900.0

Series = dict[tuple[str, str], np.ndarray]


def build(calibration: Calibration, seed: int = 7) -> RailHealth:
    return RailHealth(calibration, KeyedRandom(seed), HORIZON_DAYS * SECONDS_PER_DAY)


def unhealthy_series(health: RailHealth, calibration: Calibration) -> Series:
    """Sample every rail's health onto a common grid, once.

    Built for all rails up front and reused. The correlation tests below are
    quadratic in the number of rails, so recomputing a rail's series inside
    the pair loop -- which an earlier version did -- meant sampling the same
    trajectory a dozen times over and made the suite take two minutes.
    """
    grid = np.arange(int(HORIZON_DAYS * SECONDS_PER_DAY / SAMPLE_SECONDS)) * SAMPLE_SECONDS
    return {
        (issuer_id, method): np.fromiter(
            (
                health.rail_state(issuer_id, method, float(t)) is not RailState.HEALTHY
                for t in grid
            ),
            dtype=np.int8,
            count=len(grid),
        )
        for issuer_id, method in calibration.rails()
    }


def phi(a: np.ndarray, b: np.ndarray) -> float:
    """Pearson correlation of two binary series.

    Returns 0.0 for a constant series rather than raising or producing NaN. A
    rail that never left HEALTHY carries no information about correlation, and
    the callers average over many pairs.
    """
    if a.std() == 0.0 or b.std() == 0.0:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


@pytest.fixture(scope="module")
def coupled_series(calibration: Calibration) -> Series:
    """Rail health under the shipped calibration, sampled once for the module."""
    return unhealthy_series(build(calibration), calibration)


@pytest.fixture(scope="module")
def decoupled_series(calibration: Calibration) -> Series:
    """The same, with the issuer stress state made inert. The control."""
    decoupled = decouple(calibration)
    return unhealthy_series(build(decoupled), decoupled)


def decouple(calibration: Calibration) -> Calibration:
    """The same calibration with the issuer stress state made inert.

    ``stress_rate_multiplier = 1.0`` leaves STRESSED indistinguishable from
    NORMAL: rail rates are multiplied by one either way. Everything else is
    untouched, so any difference in the output is attributable to that one
    mechanism.
    """
    stress = calibration.rail_health.issuer_stress.model_copy(
        update={"stress_rate_multiplier": 1.0}
    )
    return calibration.model_copy(
        update={
            "rail_health": calibration.rail_health.model_copy(
                update={"issuer_stress": stress}
            )
        }
    )


def down_episode_minutes(calibration: Calibration, health: RailHealth) -> list[float]:
    durations: list[float] = []
    for issuer_id, method in calibration.rails():
        path = health.rail_trajectory(issuer_id, method)
        for index, state in enumerate(path.states):
            if state != RailState.DOWN.value:
                continue
            end = path.times[index + 1] if index + 1 < len(path.times) else health.horizon
            durations.append((end - path.times[index]) / 60.0)
    return durations


def test_outage_durations_match_theory_when_stress_is_inert(
    calibration: Calibration,
) -> None:
    """Burstiness at its root: time in DOWN comes in exponential blocks.

    With the stress modulation switched off, every rail transition uses its
    configured rate and the mean dwell time in DOWN is exactly one over
    ``down_to_degraded_per_hour``. Measuring that back is what shows the chain
    was simulated as a chain rather than sampled per instant -- a per-attempt
    coin flip would produce no dwell time at all.

    The check is done here, in the decoupled case, because it is the only case
    with a closed form. Under modulation the dwell time is a mixture over two
    regimes weighted by how much of the DOWN time falls in each, which has no
    tidy expectation to compare against.
    """
    decoupled = decouple(calibration)
    durations = down_episode_minutes(decoupled, build(decoupled))
    expected = 60.0 / calibration.rail_health.rail.down_to_degraded_per_hour

    assert len(durations) >= 50, f"only {len(durations)} outages in {HORIZON_DAYS} days"
    observed = statistics.mean(durations)
    assert 0.75 * expected <= observed <= 1.25 * expected, (
        f"mean DOWN episode {observed:.1f} min, expected around {expected:.1f} min "
        "from down_to_degraded_per_hour"
    )


def test_stress_makes_outages_both_more_frequent_and_longer(
    calibration: Calibration,
) -> None:
    """The modulation does what it claims, in both directions.

    ``stress_rate_multiplier`` scales degradation onset up and recovery down
    while the issuer is stressed. So outages under modulation should be more
    numerous than without it, and individually longer. Asserting only the
    count would miss a mechanism that made outages frequent but instantaneous,
    which would not be the persistent bad state this design is modelling.
    """
    coupled = down_episode_minutes(calibration, build(calibration))
    decoupled_calibration = decouple(calibration)
    decoupled = down_episode_minutes(
        decoupled_calibration, build(decoupled_calibration)
    )

    assert len(coupled) > len(decoupled), (
        f"{len(coupled)} outages with stress modulation versus {len(decoupled)} "
        "without; the multiplier is not raising the onset rate"
    )
    assert statistics.mean(coupled) > statistics.mean(decoupled), (
        f"mean outage {statistics.mean(coupled):.1f} min with modulation versus "
        f"{statistics.mean(decoupled):.1f} min without; stress is meant to slow "
        "recovery as well as hasten failure"
    )


def test_failures_cluster_in_time(coupled_series: Series) -> None:
    """Unhealthy minutes are concentrated in a few days, not spread evenly.

    Measured as the index of dispersion -- variance over mean -- of unhealthy
    samples per day. For an independent-per-sample process it is close to 1.
    A persistent state process makes it much larger, because a bad day is bad
    all day.
    """
    samples_per_day = int(SECONDS_PER_DAY / SAMPLE_SECONDS)

    dispersions: list[float] = []
    for series in coupled_series.values():
        per_day = [
            int(series[day : day + samples_per_day].sum())
            for day in range(0, len(series) - samples_per_day, samples_per_day)
        ]
        mean = statistics.mean(per_day)
        if mean <= 0.0:
            continue
        dispersions.append(statistics.variance(per_day) / mean)

    assert dispersions
    median = statistics.median(dispersions)
    assert median > 5.0, (
        f"index of dispersion {median:.2f}; a value near 1 would mean the "
        "outages are spread evenly across days, which is the independent "
        "coin-flip behaviour this process exists to avoid"
    )


def test_methods_on_one_issuer_move_together(
    calibration: Calibration, coupled_series: Series
) -> None:
    correlations = _within_issuer_correlations(calibration, coupled_series)
    assert correlations, "no issuer carries two methods; the test cannot measure anything"
    mean = statistics.mean(correlations)
    assert mean > 0.05, (
        f"mean within-issuer correlation {mean:.4f}. An outage on one method should "
        "raise the odds of trouble on another method at the same issuer, which is "
        "what the shared stress state is for"
    )


def test_the_correlation_vanishes_without_the_shared_stress_state(
    calibration: Calibration, coupled_series: Series, decoupled_series: Series
) -> None:
    """The control. This is what makes the previous test evidence.

    ``stress_rate_multiplier = 1.0`` makes the issuer's STRESSED state
    indistinguishable from NORMAL: the rail rates are multiplied by one either
    way. The rails then evolve independently, and the correlation should
    collapse. If it does not, the correlation in the test above is coming from
    somewhere other than the mechanism this design claims.
    """
    coupled = _within_issuer_correlations(calibration, coupled_series)
    decoupled = _within_issuer_correlations(calibration, decoupled_series)

    assert statistics.mean(decoupled) < statistics.mean(coupled) / 2.0, (
        f"correlation with coupling {statistics.mean(coupled):.4f} vs without "
        f"{statistics.mean(decoupled):.4f}. Removing the shared stress state should "
        "roughly eliminate it; that it did not means the correlation has another, "
        "unintended source"
    )
    assert abs(statistics.mean(decoupled)) < 0.03, (
        f"decoupled correlation {statistics.mean(decoupled):.4f} is not near zero"
    )


def test_rails_at_different_issuers_are_independent(
    calibration: Calibration, coupled_series: Series
) -> None:
    """No cross-issuer coupling exists, and none should.

    Correlated outages across unrelated banks would be a claim about shared
    national infrastructure that this repository has no basis for making.
    """
    pairs: list[float] = []
    rails = calibration.rails()
    for index, (issuer_a, method_a) in enumerate(rails):
        for issuer_b, method_b in rails[index + 1 :]:
            if issuer_a == issuer_b:
                continue
            pairs.append(
                phi(coupled_series[(issuer_a, method_a)], coupled_series[(issuer_b, method_b)])
            )
    assert pairs
    assert abs(statistics.mean(pairs)) < 0.03, (
        f"cross-issuer correlation {statistics.mean(pairs):.4f} should be near zero"
    )


def test_less_reliable_issuers_are_unhealthy_more_often(calibration: Calibration) -> None:
    """``reliability_multiplier`` does what its name says.

    A parameter in the calibration file that has no measurable effect on the
    output is worse than no parameter: someone will tune it and believe the
    result changed.
    """
    health = build(calibration)
    horizon = health.horizon
    fractions: list[tuple[float, float]] = []
    for issuer in calibration.issuers:
        unhealthy = 0.0
        total = 0.0
        for method in issuer.supported_methods:
            path = health.rail_trajectory(issuer.id, method)
            unhealthy += horizon - path.time_in(RailState.HEALTHY.value, horizon)
            total += horizon
        fractions.append((issuer.reliability_multiplier, unhealthy / total))

    fractions.sort()
    most_reliable = fractions[0][1]
    least_reliable = fractions[-1][1]
    assert least_reliable > most_reliable, (
        f"the least reliable issuer is unhealthy {least_reliable:.4f} of the time "
        f"and the most reliable {most_reliable:.4f}; reliability_multiplier is "
        "having no effect"
    )


def test_issuer_stress_episodes_have_the_configured_duration(
    calibration: Calibration,
) -> None:
    health = build(calibration)
    expected_hours = 1.0 / calibration.rail_health.issuer_stress.recovery_per_hour

    durations: list[float] = []
    for issuer in calibration.issuers:
        path = health.issuer_trajectory(issuer.id)
        for index, state in enumerate(path.states):
            if state != IssuerState.STRESSED.value:
                continue
            end = path.times[index + 1] if index + 1 < len(path.times) else health.horizon
            durations.append((end - path.times[index]) / SECONDS_PER_HOUR)

    assert len(durations) >= 50
    observed = statistics.mean(durations)
    assert 0.75 * expected_hours <= observed <= 1.25 * expected_hours, (
        f"mean stress episode {observed:.2f}h, expected around {expected_hours:.2f}h"
    )


def _within_issuer_correlations(calibration: Calibration, series: Series) -> list[float]:
    correlations: list[float] = []
    for issuer in calibration.issuers:
        methods = sorted(issuer.supported_methods)
        for index, method_a in enumerate(methods):
            for method_b in methods[index + 1 :]:
                correlations.append(
                    phi(series[(issuer.id, method_a)], series[(issuer.id, method_b)])
                )
    return correlations
