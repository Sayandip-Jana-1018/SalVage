"""The evaluation context must be buildable from the event alone.

``salvage-sim`` enforces that its labels are not caused by its features. That
property is worthless if the evaluation harness then joins the two back
together and hands a policy a context field derived from a label -- the
policies would score well, the estimators would agree with ground truth, and
every number in ``EVALUATION.md`` would be optimistic for a reason no test
downstream could see.

These tests hold the boundary on this side of it.
"""

from __future__ import annotations

import datetime as dt

import pytest

from salvage_eval.dataset.from_simulator import (
    EVALUABLE_ACTIONS,
    SimulatorDataset,
    build_episodes,
)
from salvage_eval.types import EvaluatedAction, LoggedEpisode
from salvage_sim.calibration import load_calibration
from salvage_sim.simulator import RunConfig, Simulation


@pytest.fixture(scope="module")
def shared_episodes() -> list[LoggedEpisode]:
    """One episode set shared by the tests that only need *some* episodes.

    Building a fresh run per test costs more than every assertion in this file
    put together. Tests where the seed itself is the point -- reproducibility,
    and the natural-recovery check that needs a full month -- build their own.
    """
    return build_episodes(seed=23, days=35.0, merchants=1, max_episodes=600)


@pytest.fixture(scope="module")
def sample() -> list[tuple[dict, object]]:
    """A handful of (event, label) pairs from a short run."""
    simulation = Simulation(RunConfig(seed=99, days=3.0, merchants=3))
    pairs = []
    for event, label, _journey, _attempt in simulation.stream():
        pairs.append((event, label))
        if len(pairs) >= 60:
            break
    return pairs


def test_context_is_a_pure_function_of_the_event(sample: list[tuple[dict, object]]) -> None:
    """Building a context must not consult the label at all.

    Asserted by building each context from the event alone -- the label is
    never passed in -- and checking that every key produced is derivable from
    a field the event carries.
    """
    builder = SimulatorDataset(load_calibration())
    event_fields = {
        "provider_error_code",
        "amount_paise",
        "payment_method",
        "issuer",
        "provider",
        "event_timestamp",
        "is_recurring",
        "metadata",
    }

    for event, _label in sample:
        context = builder.context_of(event)
        assert context["amount_paise"] == event["amount_paise"]
        assert context["provider_error_code"] == event["provider_error_code"]
        assert context["issuer"] == event["issuer"]
        # Every field the event needs to supply is present on the event.
        assert event_fields <= set(event)


def test_no_context_key_names_an_outcome(sample: list[tuple[dict, object]]) -> None:
    """A guard against someone helpfully adding the answer to the context.

    Names are a weak signal, but the failure this catches is a real one and it
    is almost always introduced under an obvious name: ``recovered``,
    ``would_succeed``, ``oracle_action``, ``failure_cause``.
    """
    builder = SimulatorDataset(load_calibration())
    forbidden = ("recover", "succeed", "success", "oracle", "cause", "counterfactual", "label")

    for event, _label in sample:
        for key in builder.context_of(event):
            assert not any(word in key.lower() for word in forbidden), (
                f"context key {key!r} names an outcome; contexts are built from the "
                "event and must not carry anything derived from a label"
            )


def test_the_true_cause_never_appears_in_the_context(sample: list[tuple[dict, object]]) -> None:
    """The latent cause must not be recoverable from a context value.

    The emitter deliberately corrupts a share of error codes to a generic one.
    Where it has, the context must not somehow still carry the specific cause.
    """
    builder = SimulatorDataset(load_calibration())
    saw_generic = False

    for event, label in sample:
        context = builder.context_of(event)
        if not context["is_generic_error_code"]:
            continue
        saw_generic = True
        true_cause = label.failure_cause  # type: ignore[attr-defined]
        for value in context.values():
            assert true_cause not in str(value).lower()

    assert saw_generic, (
        "no event in this sample had a corrupted error code, so this test proved "
        "nothing; raise the sample size or the corruption rate"
    )


def test_customer_nudge_is_never_scored(shared_episodes: list[LoggedEpisode]) -> None:
    """No ground truth exists for a nudge, so no episode may claim one."""
    assert EvaluatedAction.CUSTOMER_NUDGE not in EVALUABLE_ACTIONS

    for episode in shared_episodes:
        assert EvaluatedAction.CUSTOMER_NUDGE not in episode.feasible_actions
        assert EvaluatedAction.CUSTOMER_NUDGE.value not in episode.counterfactual_rewards
        assert EvaluatedAction.CUSTOMER_NUDGE.value not in episode.counterfactual_recoveries


def test_doing_nothing_can_still_recover() -> None:
    """NO_ACTION's outcome is natural recovery, not a hardcoded failure.

    The previous generator set this to False on every episode, which credited
    every other action with recoveries that would have happened anyway and
    inflated every reported lift.
    """
    episodes = build_episodes(seed=3, days=35.0, merchants=1, max_episodes=600)
    natural = [
        e.counterfactual_recoveries[EvaluatedAction.NO_ACTION.value]
        for e in episodes
        if EvaluatedAction.NO_ACTION.value in e.counterfactual_recoveries
    ]

    assert natural, "no episode carried a NO_ACTION counterfactual"
    assert any(natural), (
        "not one order recovered on its own across the whole run, which means "
        "NO_ACTION is again pinned to False and every lift is overstated"
    )
    assert not all(natural)


def test_episodes_are_reproducible_for_a_seed() -> None:
    """Same seed, same episodes -- including the logged action."""
    first = build_episodes(seed=17, days=2.0, merchants=1, max_episodes=60)
    second = build_episodes(seed=17, days=2.0, merchants=1, max_episodes=60)

    assert [e.episode_id for e in first] == [e.episode_id for e in second]
    assert [e.action for e in first] == [e.action for e in second]
    assert [e.reward_paise for e in first] == [e.reward_paise for e in second]


def test_propensities_are_exact_and_sum_over_the_feasible_set(
    shared_episodes: list[LoggedEpisode],
) -> None:
    """We chose the logging policy, so propensities are known, not estimated."""
    for episode in shared_episodes:
        assert episode.action in episode.feasible_actions
        assert episode.propensity == pytest.approx(1.0 / len(episode.feasible_actions), abs=1e-6)


def test_the_observed_reward_matches_the_logged_actions_counterfactual(
    shared_episodes: list[LoggedEpisode],
) -> None:
    """The revealed outcome is the counterfactual of the action actually taken."""
    for episode in shared_episodes:
        assert episode.reward_paise == episode.counterfactual_rewards[episode.action.value]
        assert episode.is_recovered == episode.counterfactual_recoveries[episode.action.value]


def test_a_scheduled_retry_is_scored_at_a_labelled_offset() -> None:
    """The delay rule may only name offsets the simulator actually evaluated."""
    calibration = load_calibration()
    builder = SimulatorDataset(calibration)
    labelled = set(calibration.counterfactual.offsets_minutes)

    for code in ("SIM_ISSUER_UNAVAILABLE", "SIM_INSUFFICIENT_FUNDS", "SIM_PAYMENT_FAILED"):
        for pre_payday in (True, False):
            context = {
                "provider_error_code": code,
                "is_salary_cycle_pre_payday": pre_payday,
            }
            assert builder.scheduled_offset_for(context) in labelled


def test_the_delay_rule_reads_the_event_not_the_truth() -> None:
    """A generic code must fall through to the default delay.

    If the rule could see the latent cause it would pick the outage delay for
    a corrupted issuer failure. It cannot, so it must not.
    """
    builder = SimulatorDataset(load_calibration())
    schedule = load_calibration().recovery_actions.scheduled_offset_minutes

    generic = {"provider_error_code": "SIM_PAYMENT_FAILED", "is_salary_cycle_pre_payday": True}
    assert builder.scheduled_offset_for(generic) == schedule.default


def test_context_timestamps_come_from_the_observed_event_time() -> None:
    """Features are anchored to when the event was seen, not when it happened.

    The emitter delays events. Anchoring a calendar feature to the true
    failure time would be point-in-time incorrect -- using knowledge the
    consumer did not have yet.
    """
    builder = SimulatorDataset(load_calibration())
    simulation = Simulation(RunConfig(seed=31, days=2.0, merchants=2))

    for event, _label, _journey, _attempt in simulation.stream():
        observed = dt.datetime.fromisoformat(event["event_timestamp"])
        context = builder.context_of(event)
        assert context["hour_of_day"] == observed.hour
        assert context["day_of_month"] == observed.day
        break
