"""Ground-truth counterfactual labels.

For every failure the simulator records what *would* have happened under each
recovery action available to a policy: retry the same rail after each of
several delays, or move to an alternative rail after each of those delays.
These are the labels the Phase 5 off-policy evaluation needs, and they are the
reason a simulator exists at all rather than a replay of historical data --
production data contains the outcome of the action that was taken and nothing
about the ones that were not.

The no-leakage property
-----------------------

Everything here reads :mod:`salvage_sim.latent` and nothing else. It has no
import path to :mod:`salvage_sim.generate`, so it cannot see an emitted event,
an observation delay, a corrupted error code, or any feature a model will be
built on. Dependence flows ``latent -> {features, labels}``, never
``features -> labels``.

The literal phrasing "labels causally independent of features" would be an
impossible requirement: if it held, the features would carry no information
about the labels and no model could learn anything. What is required, and what
is enforced here, is that the features do not *cause* the labels -- they are
both consequences of the same underlying world.

Two tests hold this in place, and they catch different failures:

- ``tests/test_leakage_architecture.py`` walks the import graph of this
  package and asserts it stays inside a whitelist. It catches the structural
  version: someone imports the event model to "just read the amount".
- ``tests/test_leakage_invariance.py`` perturbs every feature-only nuisance
  parameter and asserts the labels come out bit-identical while the events do
  not. It catches the version the import graph cannot see: a value that
  reached here through a shared object rather than an import.

Why the labels are queries and not a second simulation
------------------------------------------------------

Each counterfactual calls the same :class:`~salvage_sim.latent.outcome.
OutcomeModel` on the same :class:`~salvage_sim.latent.world.World` that
produced the real timeline. That is what makes it a counterfactual rather than
a differently-parameterised story: same world, same mechanism, one thing
changed. It is only possible because the world is materialised up front and
every draw is keyed, so evaluating it at a future time has no side effects and
asking the same question twice gives the same answer.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass

from salvage_sim.calibration import Calibration
from salvage_sim.clock import SECONDS_PER_HOUR, SECONDS_PER_MINUTE
from salvage_sim.latent.journey import Attempt, OrderJourney
from salvage_sim.latent.outcome import FailureCause, Rail
from salvage_sim.latent.world import World


class ActionKind(enum.StrEnum):
    """The recovery actions the labels cover.

    Deliberately the same three a Phase 4 policy will be able to take, no
    more. Labelling an action the system cannot perform would produce an
    oracle bound nothing could ever reach, which is worse than no bound: it
    would make every policy look bad by a constant margin and hide real
    differences between them.
    """

    NONE = "none"
    RETRY_SAME_RAIL = "retry_same_rail"
    SWITCH_RAIL = "switch_rail"


@dataclass(frozen=True, slots=True)
class Counterfactual:
    """One (action, delay) pair and what it would have produced."""

    action: ActionKind
    offset_minutes: float
    rail: str
    would_succeed: bool
    failure_cause: str | None

    def __post_init__(self) -> None:
        if self.would_succeed != (self.failure_cause is None):
            raise ValueError("a counterfactual has a cause if and only if it failed")


@dataclass(frozen=True, slots=True)
class OracleAction:
    """The best available action, and whether it recovers the payment.

    "Best" is the earliest recovery, not just any recovery: an action that
    recovers at three days and one that recovers at five minutes are not
    equally good, and a policy that always chose the slowest successful action
    would score identically to one that chose well if only success were
    scored. Ties break towards the shorter delay, then towards retrying the
    same rail, which is the cheaper action.

    This is the upper bound the Phase 5 regret accounting measures against. It
    is an oracle in the strict sense -- it required knowing the future -- so
    no policy can be expected to reach it. Its value is that the gap between
    a policy and this bound is measurable, and the gap between two policies is
    interpretable against a common ceiling.
    """

    action: ActionKind
    offset_minutes: float | None
    rail: str | None
    recovers: bool


@dataclass(frozen=True, slots=True)
class FailureLabel:
    """The full ground truth for one observed failure."""

    payment_attempt_id: str
    order_id: str
    merchant_id: str
    failure_cause: str
    is_permanent: bool
    is_rail_specific: bool
    recovered_naturally_in_window: bool
    """Did this order recover with no intervention, inside the attribution
    window? The quantity the incremental metric subtracts."""

    natural_recovery_delay_minutes: float | None
    counterfactuals: tuple[Counterfactual, ...]
    oracle: OracleAction


class CounterfactualLabeller:
    """Computes labels for the failures in a journey.

    Holds a reference to the world, which is the only input it has. It is
    given no events, no features, and no observation settings.
    """

    def __init__(self, world: World) -> None:
        self._world = world
        calibration: Calibration = world.calibration
        self._offsets = tuple(calibration.counterfactual.offsets_minutes)
        self._alternatives = calibration.counterfactual.alternative_rails_per_failure
        self._window_seconds = calibration.attribution.window_hours * SECONDS_PER_HOUR

    def label(self, journey: OrderJourney, failure: Attempt) -> FailureLabel:
        cause = failure.outcome.cause
        if cause is None:
            raise ValueError(f"{failure.payment_attempt_id} did not fail")

        counterfactuals = self._counterfactuals(journey, failure, cause)
        success_at = journey.succeeded_at
        recovered_naturally = journey.recovered_naturally_within(failure, self._window_seconds)

        return FailureLabel(
            payment_attempt_id=failure.payment_attempt_id,
            order_id=failure.order_id,
            merchant_id=failure.merchant_id,
            failure_cause=cause.value,
            is_permanent=cause.is_permanent,
            is_rail_specific=cause.is_rail_specific,
            recovered_naturally_in_window=recovered_naturally,
            natural_recovery_delay_minutes=(
                (success_at - failure.at) / SECONDS_PER_MINUTE
                if recovered_naturally and success_at is not None
                else None
            ),
            counterfactuals=counterfactuals,
            oracle=self._oracle(counterfactuals),
        )

    def _counterfactuals(
        self, journey: OrderJourney, failure: Attempt, cause: FailureCause
    ) -> tuple[Counterfactual, ...]:
        rails: list[tuple[ActionKind, Rail]] = [(ActionKind.RETRY_SAME_RAIL, failure.rail)]
        rails.extend(
            (ActionKind.SWITCH_RAIL, rail)
            for rail in self._world.alternative_rails(failure.rail, self._alternatives)
        )

        results: list[Counterfactual] = []
        for action, rail in rails:
            for offset in self._offsets:
                results.append(self._evaluate(journey, failure, action, rail, offset))
        # A permanent cause must never produce a successful counterfactual on
        # any rail at any delay. The outcome model guarantees it -- a dead
        # mandate is checked first and independently of rail and time -- but
        # asserting it here makes the guarantee local, so a future change to
        # the ordering in OutcomeModel fails loudly rather than quietly
        # producing labels that say an expired mandate can be recovered.
        if cause.is_permanent and any(result.would_succeed for result in results):
            raise AssertionError(
                f"{failure.payment_attempt_id} failed permanently ({cause.value}) but a "
                "counterfactual succeeded; the outcome model's ordering has changed"
            )
        return tuple(results)

    def _evaluate(
        self,
        journey: OrderJourney,
        failure: Attempt,
        action: ActionKind,
        rail: Rail,
        offset_minutes: float,
    ) -> Counterfactual:
        at = failure.at + offset_minutes * SECONDS_PER_MINUTE
        # Keyed so that this hypothetical attempt is its own trial, distinct
        # from the real attempt and from every other counterfactual. Including
        # the rail and the offset means the same question always gets the same
        # answer, and two different questions never share one.
        attempt_key = f"cf_{failure.payment_attempt_id}_{offset_minutes:g}_{rail}"
        outcome = self._world.outcomes.evaluate(
            customer=journey.order.customer,
            rail=rail,
            mandate=journey.order.mandate,
            t=at,
            attempt_key=attempt_key,
        )
        return Counterfactual(
            action=action,
            offset_minutes=offset_minutes,
            rail=str(rail),
            would_succeed=outcome.succeeded,
            failure_cause=outcome.cause.value if outcome.cause else None,
        )

    @staticmethod
    def _oracle(counterfactuals: tuple[Counterfactual, ...]) -> OracleAction:
        successes = [c for c in counterfactuals if c.would_succeed]
        if not successes:
            return OracleAction(
                action=ActionKind.NONE, offset_minutes=None, rail=None, recovers=False
            )
        # Earliest first; then prefer retrying the same rail, which costs less
        # than moving the payment.
        best = min(
            successes,
            key=lambda c: (c.offset_minutes, c.action is not ActionKind.RETRY_SAME_RAIL, c.rail),
        )
        return OracleAction(
            action=best.action,
            offset_minutes=best.offset_minutes,
            rail=best.rail,
            recovers=True,
        )
