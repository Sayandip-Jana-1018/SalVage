"""Issuer and rail health as a two-level continuous-time Markov chain.

Why a Markov chain, and why two levels
--------------------------------------

The requirement is that outages be **bursty and correlated**, not independent
coin flips per attempt. Two families of model give you that.

A *self-exciting point process* -- a Hawkes process -- makes each failure raise
the intensity of the next. It is the right model when the mechanism really is
contagion: one event causes another. That is not what happens at an issuer. A
bank's authorisation stack does not fail because it failed a moment ago; it
fails because it has entered a bad state -- a saturated connection pool, a
switch under maintenance, a downstream partner timing out -- and it stays in
that state for a while. Failures during the episode are consequences of the
state, not of each other.

A *modulated Markov chain* says exactly that: there is a hidden state, it
persists, and it governs the failure probability while it lasts. That is the
mechanism, so that is the model. It also has a practical advantage that
matters more than elegance: its parameters are things a bank operations person
can argue with. ``onset_per_day`` is how often incidents start and
``recovery_per_hour`` is one over the MTTR. A Hawkes kernel's decay constant is
not a number anyone can sanity-check.

The chain has two levels because correlation across methods needs somewhere to
come from. Per-rail chains alone would make a UPI outage at an issuer tell you
nothing about its cards. In reality shared infrastructure means it usually
does. So each issuer holds a NORMAL/STRESSED state, and while it is STRESSED
every one of that issuer's rails degrades more readily and recovers more
slowly. One parameter, ``stress_rate_multiplier``, controls how tightly the
methods move together, and setting it to 1.0 recovers the independent case --
which is what ``test_health_process.py`` uses to show the correlation is real
and comes from this mechanism.

Trajectories, not stepping
--------------------------

Each chain is simulated once, ahead of time, over the whole horizon, and
stored as a piecewise-constant path: a sorted array of transition times and
the state entered at each. Lookup is a binary search.

This is not an optimisation. It is what makes counterfactual labels possible.
A label asks "would a retry twenty-four hours from now have succeeded?", which
requires evaluating the world at a time the main timeline has not reached. If
health were advanced incrementally as events were generated, answering that
would mean either running the chain forward and corrupting the state, or
copying and re-running it per query. With the trajectory materialised up front,
the question is a pure lookup against a fixed object, and asking it cannot
perturb anything.
"""

from __future__ import annotations

import bisect
import enum
from dataclasses import dataclass

from salvage_sim.calibration import Calibration, PaymentMethod
from salvage_sim.clock import SECONDS_PER_DAY, SECONDS_PER_HOUR
from salvage_sim.rng import KeyedRandom


class IssuerState(enum.StrEnum):
    NORMAL = "normal"
    STRESSED = "stressed"


class RailState(enum.StrEnum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"


@dataclass(frozen=True, slots=True)
class Trajectory:
    """A piecewise-constant path over ``[0, horizon]``.

    ``times[i]`` is when ``states[i]`` was entered. ``times[0]`` is always 0.0.
    """

    times: tuple[float, ...]
    states: tuple[str, ...]

    def __post_init__(self) -> None:
        if len(self.times) != len(self.states):
            raise ValueError("trajectory times and states must be the same length")
        if not self.times:
            raise ValueError("trajectory must have at least an initial state")
        if self.times[0] != 0.0:
            raise ValueError("trajectory must start at t=0.0")

    def at(self, t: float) -> str:
        """State at time ``t``.

        Times before 0 clamp to the initial state, and times past the last
        transition return the final state, so a counterfactual offset that
        runs off the end of the horizon degrades gracefully instead of
        raising. ``bisect_right`` makes the interval half-open on the right,
        so a query exactly at a transition time sees the new state -- the
        convention that matches "the transition happened at that instant".
        """
        if t <= 0.0:
            return self.states[0]
        return self.states[bisect.bisect_right(self.times, t) - 1]

    def transitions_into(self, state: str) -> tuple[float, ...]:
        """Times at which ``state`` was entered. Used by the tests."""
        return tuple(t for t, s in zip(self.times, self.states, strict=True) if s == state)

    def time_in(self, state: str, horizon: float) -> float:
        """Total time spent in ``state`` over ``[0, horizon]``."""
        total = 0.0
        for index, (start, current) in enumerate(zip(self.times, self.states, strict=True)):
            end = self.times[index + 1] if index + 1 < len(self.times) else horizon
            if current == state:
                total += min(end, horizon) - min(start, horizon)
        return total


def _simulate_two_state(
    rng_stream: KeyedRandom,
    stream: str,
    key: tuple[object, ...],
    horizon: float,
    rate_out_of_first: float,
    rate_out_of_second: float,
    first: str,
    second: str,
) -> Trajectory:
    """Gillespie simulation of an alternating two-state chain.

    Starts in ``first``, which for the issuer chain means every issuer begins
    the run healthy. That is a deliberate simplification over drawing from the
    stationary distribution: it makes the start of a run comparable across
    seeds, and the chain mixes within the first day at these rates. Runs are
    days long, so the transient is negligible; the alternative would make the
    first few hours of every dataset differ for reasons unrelated to the
    scenario being studied.
    """
    generator = rng_stream.generator(stream, *key)
    times = [0.0]
    states = [first]
    t = 0.0
    current = first
    while True:
        rate = rate_out_of_first if current == first else rate_out_of_second
        t += float(generator.exponential(1.0 / rate))
        if t >= horizon:
            break
        current = second if current == first else first
        times.append(t)
        states.append(current)
    return Trajectory(times=tuple(times), states=tuple(states))


def _simulate_rail(
    rng_stream: KeyedRandom,
    key: tuple[object, ...],
    horizon: float,
    issuer_path: Trajectory,
    calibration: Calibration,
    reliability_multiplier: float,
) -> Trajectory:
    """Simulate one rail's health under a given issuer stress path.

    The rail chain is time-inhomogeneous: its rates jump whenever the issuer
    switches between NORMAL and STRESSED. Rather than thinning against a
    global bound, the simulation steps to whichever comes first, the next
    exponential draw or the next issuer transition. Between issuer transitions
    the rates are constant, so the exponential draw is exact there, and the
    memorylessness of the exponential distribution makes discarding an
    unreached draw at an issuer transition sound: the residual waiting time
    under the new rate is drawn afresh with no bias.
    """
    settings = calibration.rail_health
    multiplier = settings.issuer_stress.stress_rate_multiplier

    # Per-second rates. Onset scales with the issuer's unreliability; recovery
    # does not, because how fast a bank restores service is not the same
    # property as how often it breaks, and conflating them would make the
    # unreliable issuers unrealistically easy to route around.
    healthy_to_degraded = (
        settings.rail.healthy_to_degraded_per_day / SECONDS_PER_DAY * reliability_multiplier
    )
    degraded_to_down = settings.rail.degraded_to_down_per_hour / SECONDS_PER_HOUR
    degraded_to_healthy = settings.rail.degraded_to_healthy_per_hour / SECONDS_PER_HOUR
    down_to_degraded = settings.rail.down_to_degraded_per_hour / SECONDS_PER_HOUR

    generator = rng_stream.generator("latent.health.rail", *key)
    times = [0.0]
    states = [RailState.HEALTHY.value]
    t = 0.0
    current = RailState.HEALTHY

    # The issuer transition times, walked in step with the rail simulation.
    issuer_times = issuer_path.times
    next_issuer_index = 1

    while t < horizon:
        stressed = issuer_path.at(t) == IssuerState.STRESSED.value
        onset_scale = multiplier if stressed else 1.0
        recovery_scale = (1.0 / multiplier) if stressed else 1.0

        competing: tuple[tuple[float, RailState], ...]
        if current is RailState.HEALTHY:
            competing = ((healthy_to_degraded * onset_scale, RailState.DEGRADED),)
        elif current is RailState.DEGRADED:
            competing = (
                (degraded_to_down * onset_scale, RailState.DOWN),
                (degraded_to_healthy * recovery_scale, RailState.HEALTHY),
            )
        else:
            competing = ((down_to_degraded * recovery_scale, RailState.DEGRADED),)

        total_rate = sum(rate for rate, _ in competing)
        t_next = t + float(generator.exponential(1.0 / total_rate))

        # The next moment the rates change, if it arrives first.
        while next_issuer_index < len(issuer_times) and issuer_times[next_issuer_index] <= t:
            next_issuer_index += 1
        next_change = (
            issuer_times[next_issuer_index] if next_issuer_index < len(issuer_times) else horizon
        )

        if t_next > next_change:
            # No transition before the rates change. Advance to the change and
            # redraw under the new rates.
            t = next_change
            if t >= horizon:
                break
            continue

        if t_next >= horizon:
            break

        # Which of the competing transitions fired.
        target = float(generator.random()) * total_rate
        cumulative = 0.0
        chosen = competing[-1][1]
        for rate, destination in competing:
            cumulative += rate
            if target < cumulative:
                chosen = destination
                break

        t = t_next
        current = chosen
        times.append(t)
        states.append(current.value)

    return Trajectory(times=tuple(times), states=tuple(states))


class RailHealth:
    """Materialised health trajectories for every issuer and rail.

    Construction runs the chains; after that every method is a pure lookup and
    the object is safe to query at any time, in any order, including times the
    main event timeline has not reached.
    """

    def __init__(self, calibration: Calibration, rng: KeyedRandom, horizon_seconds: float) -> None:
        if horizon_seconds <= 0.0:
            raise ValueError("horizon must be positive")
        self._calibration = calibration
        self._horizon = horizon_seconds

        stress = calibration.rail_health.issuer_stress
        onset = stress.onset_per_day / SECONDS_PER_DAY
        recovery = stress.recovery_per_hour / SECONDS_PER_HOUR

        self._issuer_paths: dict[str, Trajectory] = {}
        for issuer in calibration.issuers:
            self._issuer_paths[issuer.id] = _simulate_two_state(
                rng,
                "latent.health.issuer",
                (issuer.id,),
                horizon_seconds,
                # An issuer that breaks more often enters stress more often,
                # and this is where that shows up for the whole institution
                # rather than rail by rail.
                onset * issuer.reliability_multiplier,
                recovery,
                IssuerState.NORMAL.value,
                IssuerState.STRESSED.value,
            )

        self._rail_paths: dict[tuple[str, str], Trajectory] = {}
        for issuer_id, method in calibration.rails():
            issuer = calibration.issuer(issuer_id)
            self._rail_paths[(issuer_id, method)] = _simulate_rail(
                rng,
                (issuer_id, method),
                horizon_seconds,
                self._issuer_paths[issuer_id],
                calibration,
                issuer.reliability_multiplier,
            )

    @property
    def horizon(self) -> float:
        return self._horizon

    def issuer_state(self, issuer_id: str, t: float) -> IssuerState:
        return IssuerState(self._issuer_paths[issuer_id].at(t))

    def rail_state(self, issuer_id: str, method: PaymentMethod, t: float) -> RailState:
        path = self._rail_paths.get((issuer_id, method))
        if path is None:
            raise KeyError(f"issuer {issuer_id!r} does not carry {method!r}")
        return RailState(path.at(t))

    def carries(self, issuer_id: str, method: PaymentMethod) -> bool:
        return (issuer_id, method) in self._rail_paths

    def success_multiplier(self, issuer_id: str, method: PaymentMethod, t: float) -> float:
        """How much of the rail's healthy success probability survives at ``t``."""
        multipliers = self._calibration.rail_health.success_multiplier
        match self.rail_state(issuer_id, method, t):
            case RailState.HEALTHY:
                return multipliers.healthy
            case RailState.DEGRADED:
                return multipliers.degraded
            case RailState.DOWN:
                return multipliers.down

    def issuer_trajectory(self, issuer_id: str) -> Trajectory:
        """Exposed for the tests, which assert properties of the path itself."""
        return self._issuer_paths[issuer_id]

    def rail_trajectory(self, issuer_id: str, method: PaymentMethod) -> Trajectory:
        return self._rail_paths[(issuer_id, method)]
