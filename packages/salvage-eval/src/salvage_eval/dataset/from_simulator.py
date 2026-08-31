"""Turn simulator output into logged episodes with known propensities.

This is the join between Phase 1 and Phase 5, and it is the file that decides
whether the evaluation means anything.

Why it exists
-------------

``salvage-eval`` previously generated its own episodes inline, from a handful
of scalar constants: a taxonomy distribution, and one recovery probability per
(cause, action) pair. Two things were wrong with that.

The first is that it duplicated, badly, a thing this repository already had.
``salvage-sim`` produces ground truth from a materialised world -- a two-level
Markov chain over issuer and rail health, salary-cycle balance dynamics, a
mandate book -- and evaluates each counterfactual as a query against that same
world at a different time. That is a causal counterfactual. Six constants are
not.

The second is worse. The policy under evaluation, ``ContextualBanditPolicy``,
carried the generator's own parameters, offset by roughly 0.03 -- and in one
case (issuer outage, scheduled retry) identical to three decimal places. The
candidate policy held the answer key. The reported margin over the baselines
measured how closely two hand-written tables of constants agreed with each
other.

Reading ground truth from the simulator dissolves that problem rather than
policing it: no policy can encode the parameters of a materialised CTMC world
in a lookup table, so any margin it shows has to come from the features.

The leakage boundary
--------------------

``context`` is built **only** from the emitted event -- the same delayed,
sometimes-generic, sometimes-issuer-less record ``salvage-core`` would receive
from a gateway. Outcomes are read **only** from the label. Nothing derived
from a label ever reaches a context field, which is what keeps
``salvage-sim``'s no-leakage property intact across the package boundary.
``tests/test_no_label_leakage.py`` enforces it.

What is and is not evaluable
----------------------------

The simulator labels three action kinds: do nothing, retry the same rail, and
switch rails -- each at a grid of delays. It has no model of how a customer
responds to a message, so there is **no ground truth for CUSTOMER_NUDGE
anywhere in this repository**. Rather than invent a response model, nudges are
excluded from the evaluable action space and the harness reports how often a
policy wanted one. See :data:`EVALUABLE_ACTIONS`.
"""

from __future__ import annotations

import datetime as dt
import hashlib
from dataclasses import dataclass
from typing import Any

from salvage_eval.types import EvaluatedAction, LoggedEpisode
from salvage_sim.calibration import Calibration
from salvage_sim.labels.counterfactual import ActionKind, Counterfactual, FailureLabel
from salvage_sim.simulator import RunConfig, Simulation

# The actions the simulator provides ground truth for. CUSTOMER_NUDGE is
# absent by construction, not by oversight: see the module docstring.
EVALUABLE_ACTIONS: tuple[EvaluatedAction, ...] = (
    EvaluatedAction.RETRY_IMMEDIATE,
    EvaluatedAction.RETRY_SCHEDULED,
    EvaluatedAction.SWITCH_RAIL,
    EvaluatedAction.NO_ACTION,
)

IMMEDIATE_OFFSET_MINUTES = 0.0

# Observable gateway codes that indicate the issuer, rather than the customer
# or the instrument, is the problem. Used only to pick which scheduled-retry
# delay applies. Read off the *event*, never the label -- when the emitter
# corrupts a code to the generic one, this correctly falls through to the
# default delay, which is exactly the degradation a real system suffers.
ISSUER_TROUBLE_CODES = frozenset({"SIM_ISSUER_UNAVAILABLE", "SIM_ISSUER_TIMEOUT"})
INSUFFICIENT_FUNDS_CODE = "SIM_INSUFFICIENT_FUNDS"

# Attempt cap, mirroring the bounds engine's. An attempt at or past this
# sequence number may not be retried again.
MAX_ATTEMPTS = 3

# Days of the month treated as the pre-payday squeeze. A calendar fact derived
# from the event timestamp, not a latent variable.
PRE_PAYDAY_DAYS = range(20, 28)


@dataclass(frozen=True, slots=True)
class ActionOutcome:
    """What one action would have produced, and what it would have cost."""

    recovered: bool
    reward_paise: int


class SimulatorDataset:
    """Builds :class:`LoggedEpisode` records from a simulator run."""

    def __init__(self, calibration: Calibration) -> None:
        self._calibration = calibration
        self._costs = calibration.recovery_actions.cost_paise
        self._schedule = calibration.recovery_actions.scheduled_offset_minutes

    # -- context -----------------------------------------------------------

    def context_of(self, event: dict[str, Any]) -> dict[str, Any]:
        """The observable feature context, built from the event alone.

        Every field here is one a production consumer would have. Nothing is
        read from the label; adding a field that was would silently make every
        estimate optimistic and no test downstream would notice.
        """
        observed_at = dt.datetime.fromisoformat(event["event_timestamp"])
        day_of_month = observed_at.day
        error_code = str(event["provider_error_code"])

        return {
            "provider_error_code": error_code,
            "amount_paise": int(event["amount_paise"]),
            "payment_method": event["payment_method"],
            "issuer": event["issuer"],
            "rail_id": f"{event['issuer']}|{event['payment_method']}|{event['provider']}",
            "hour_of_day": observed_at.hour,
            "day_of_month": day_of_month,
            "is_salary_cycle_pre_payday": day_of_month in PRE_PAYDAY_DAYS,
            "is_recurring": bool(event["is_recurring"]),
            "attempt_sequence": int(event["metadata"]["sim_attempt_sequence"]),
            # True when the gateway reported nothing specific. A policy that
            # ignores this is claiming to diagnose a failure it was told
            # nothing about.
            "is_generic_error_code": error_code == "SIM_PAYMENT_FAILED",
        }

    # -- feasibility -------------------------------------------------------

    def feasible_actions(
        self, context: dict[str, Any], label: FailureLabel
    ) -> list[EvaluatedAction]:
        """Actions the bounds allow *and* the simulator can score.

        ``label`` is consulted only for whether a switch counterfactual
        exists, which is a property of the labelling grid rather than of the
        outcome. It never reveals whether anything succeeded.
        """
        feasible: list[EvaluatedAction] = []

        if int(context["attempt_sequence"]) < MAX_ATTEMPTS:
            feasible.append(EvaluatedAction.RETRY_IMMEDIATE)
            feasible.append(EvaluatedAction.RETRY_SCHEDULED)
            if self._switch_rail_id(label) is not None:
                feasible.append(EvaluatedAction.SWITCH_RAIL)

        # Always available, and always the safe floor.
        feasible.append(EvaluatedAction.NO_ACTION)
        return feasible

    # -- outcomes ----------------------------------------------------------

    def scheduled_offset_for(self, context: dict[str, Any]) -> float:
        """Which labelled delay a scheduled retry is scored at.

        A property of the environment, identical for every policy, resolved
        from the observable code and the calendar.
        """
        code = context["provider_error_code"]
        if code in ISSUER_TROUBLE_CODES:
            return self._schedule.issuer_outage
        if code == INSUFFICIENT_FUNDS_CODE and context["is_salary_cycle_pre_payday"]:
            return self._schedule.pre_payday_insufficient_funds
        return self._schedule.default

    def _switch_rail_id(self, label: FailureLabel) -> str | None:
        """The rail a switch would move to, or None if there is nowhere.

        The first alternative in the world's ranking, which orders by customer
        affinity. Deliberately *not* the best-performing alternative: picking
        that would require knowing each one's outcome, which would make every
        switch an oracle and inflate the action's measured value.
        """
        for cf in label.counterfactuals:
            if cf.action is ActionKind.SWITCH_RAIL:
                return cf.rail
        return None

    def _find(
        self, label: FailureLabel, kind: ActionKind, offset: float, rail: str | None = None
    ) -> Counterfactual:
        for cf in label.counterfactuals:
            matches_rail = rail is None or cf.rail == rail
            if cf.action is kind and cf.offset_minutes == offset and matches_rail:
                return cf
        raise KeyError(
            f"{label.payment_attempt_id} has no counterfactual for "
            f"{kind.value} at offset {offset} (rail={rail}). The labelling grid and "
            "the evaluable action space have diverged."
        )

    def outcome_of(
        self, action: EvaluatedAction, context: dict[str, Any], label: FailureLabel
    ) -> ActionOutcome:
        """Ground-truth recovery and payoff for one action."""
        amount = int(context["amount_paise"])

        if action is EvaluatedAction.NO_ACTION:
            # Doing nothing is not the same as not recovering. An order can
            # resolve on its own inside the attribution window -- the customer
            # retries, the issuer comes back -- and crediting an action with
            # that recovery is exactly the error the incremental metric
            # exists to prevent. The old generator hardcoded this to False,
            # which made every action look better than it was.
            recovered = label.recovered_naturally_in_window
            return ActionOutcome(recovered, amount if recovered else 0)

        if action is EvaluatedAction.RETRY_IMMEDIATE:
            cf = self._find(label, ActionKind.RETRY_SAME_RAIL, IMMEDIATE_OFFSET_MINUTES)
            cost = self._costs.retry_immediate
        elif action is EvaluatedAction.RETRY_SCHEDULED:
            cf = self._find(
                label, ActionKind.RETRY_SAME_RAIL, self.scheduled_offset_for(context)
            )
            cost = self._costs.retry_scheduled
        elif action is EvaluatedAction.SWITCH_RAIL:
            rail = self._switch_rail_id(label)
            if rail is None:
                raise KeyError(f"{label.payment_attempt_id} has no alternative rail")
            cf = self._find(label, ActionKind.SWITCH_RAIL, IMMEDIATE_OFFSET_MINUTES, rail)
            cost = self._costs.switch_rail
        else:
            raise ValueError(f"{action} has no ground truth; it is not in EVALUABLE_ACTIONS")

        return ActionOutcome(cf.would_succeed, (amount - cost) if cf.would_succeed else -cost)


def build_episodes(
    seed: int,
    days: float,
    merchants: int,
    max_episodes: int | None = None,
    calibration: Calibration | None = None,
) -> list[LoggedEpisode]:
    """Run the simulator and log one episode per observed failure.

    The logging policy is uniform over the feasible actions. That is a
    deliberate choice and it is the best case for estimator validation rather
    than a realistic one: a uniform logger puts positive probability on every
    feasible action, so importance weights stay bounded and the estimators are
    identifiable everywhere. A production log would be far more concentrated
    and would leave some strata unsupported -- which is the case the Kish
    effective sample size diagnostic exists to detect, and which this dataset
    therefore does *not* exercise. ``EVALUATION.md`` states this.

    Propensities are exact, not estimated, because we chose the logger.
    """
    simulation = Simulation(
        RunConfig(seed=seed, days=days, merchants=merchants), calibration=calibration
    )
    builder = SimulatorDataset(simulation.calibration)
    rng = simulation.rng

    episodes: list[LoggedEpisode] = []
    for event, label, _journey, _attempt in simulation.stream():
        context = builder.context_of(event)
        feasible = builder.feasible_actions(context, label)

        counterfactual_rewards: dict[str, int] = {}
        counterfactual_recoveries: dict[str, bool] = {}
        for action in feasible:
            outcome = builder.outcome_of(action, context, label)
            counterfactual_rewards[action.value] = outcome.reward_paise
            counterfactual_recoveries[action.value] = outcome.recovered

        # Keyed on the attempt id so the logged action is reproducible for a
        # given seed and independent of iteration order.
        draw = rng.uniform("eval.logging_policy", label.payment_attempt_id)
        logged = feasible[min(int(draw * len(feasible)), len(feasible) - 1)]
        propensity = 1.0 / len(feasible)

        episodes.append(
            LoggedEpisode(
                episode_id=label.payment_attempt_id,
                context=context,
                action=logged,
                propensity=round(propensity, 6),
                feasible_actions=feasible,
                reward_paise=counterfactual_rewards[logged.value],
                is_recovered=counterfactual_recoveries[logged.value],
                counterfactual_rewards=counterfactual_rewards,
                counterfactual_recoveries=counterfactual_recoveries,
            )
        )

    return _subsample(episodes, max_episodes)


def _subsample(episodes: list[LoggedEpisode], limit: int | None) -> list[LoggedEpisode]:
    """Cap the dataset by sampling across the run, never by truncating it.

    This used to ``break`` out of the generation loop once the cap was
    reached, which sounds harmless and is not: the simulator emits in
    chronological order, so a prefix is the *first few days* of the run and
    nothing else. At twelve merchants a 5,000-episode cap was satisfied inside
    four simulated days, so every dataset the harness ever produced contained
    only days 1 to 4 of a month.

    That silently deleted a feature. ``is_salary_cycle_pre_payday`` marks days
    20 to 27; no episode ever fell in that window, so the salary-cycle
    dynamics the simulator models -- and the payday-anchored scheduling rule
    the policy relies on -- were never once exercised. Every fitted cell read
    ``pre_payday=no`` and the whole mechanism was untested while appearing to
    be covered.

    Sampling by hash keeps the cap while spanning the run, and is
    deterministic so two people get the same dataset.
    """
    if limit is None or len(episodes) <= limit:
        return episodes

    # Rank by hash, keep the lowest `limit`, then restore the original
    # ordering. Downstream code reads these as a stream in the order the
    # failures happened, so returning them in hash order would make any
    # time-based reading nonsense.
    ranked = sorted(enumerate(episodes), key=lambda pair: _sample_key(pair[1].episode_id))
    kept = sorted(ranked[:limit], key=lambda pair: pair[0])
    return [episode for _, episode in kept]


def _sample_key(episode_id: str) -> str:
    """A stable pseudo-random rank for an episode."""
    return hashlib.sha256(f"subsample:{episode_id}".encode()).hexdigest()
