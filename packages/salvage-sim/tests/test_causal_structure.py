"""The four failure types must have four different correct responses.

This is what makes the generated dataset a decision problem rather than a
classification exercise. If retrying were always right, or switching rail
always right, any policy that picked one action and stuck to it would score as
well as one that diagnosed anything.

The table these tests hold in place:

===========================  ==============  ==============
Failure                      Wait helps?     Switch helps?
===========================  ==============  ==============
Insufficient funds           yes             no
Issuer unavailable           yes             yes
Instrument expired           no              yes
Mandate expired or revoked   no              no
===========================  ==============  ==============

Several of the assertions below are exact -- a rate of zero, not a small rate.
Those are the ones worth having. "Switching rails helps insufficient funds
less often than it helps outages" would be satisfied by a model that got the
mechanism only roughly right; "switching rails never once recovered an
insufficient-funds decline at the same instant" can only hold if balance is
genuinely a property of the payer rather than the rail.
"""

from __future__ import annotations

from collections import defaultdict

import pytest

from salvage_sim.labels.counterfactual import ActionKind, FailureLabel
from salvage_sim.simulator import RunConfig, Simulation

MINIMUM_PER_CAUSE = 20


@pytest.fixture(scope="module")
def labels() -> list[FailureLabel]:
    """A run large enough to contain every failure cause several times over."""
    simulation = Simulation(RunConfig(seed=31337, days=5.0, merchants=2))
    return [label for _, label, _, _ in simulation.stream()]


@pytest.fixture(scope="module")
def by_cause(labels: list[FailureLabel]) -> dict[str, list[FailureLabel]]:
    grouped: dict[str, list[FailureLabel]] = defaultdict(list)
    for label in labels:
        grouped[label.failure_cause].append(label)
    return dict(grouped)


def _rate(labels: list[FailureLabel], action: ActionKind, offset: float) -> float:
    matching = [
        c
        for label in labels
        for c in label.counterfactuals
        if c.action is action and c.offset_minutes == offset
    ]
    if not matching:
        return 0.0
    return sum(1 for c in matching if c.would_succeed) / len(matching)


def _longest_offset(labels: list[FailureLabel]) -> float:
    return max(c.offset_minutes for c in labels[0].counterfactuals)


def test_every_failure_cause_is_represented(by_cause: dict[str, list[FailureLabel]]) -> None:
    """Guard against an empty-group assertion passing vacuously.

    Every test below filters by cause. If a cause never occurred, its test
    would assert over an empty list and pass, which would be the opposite of
    informative.
    """
    expected = {
        "insufficient_funds",
        "issuer_unavailable",
        "issuer_degraded",
        "declined_by_issuer",
        "instrument_expired",
    }
    missing = sorted(
        cause
        for cause in expected
        if len(by_cause.get(cause, [])) < MINIMUM_PER_CAUSE
    )
    assert not missing, (
        f"fewer than {MINIMUM_PER_CAUSE} failures for {missing}. "
        f"Observed counts: { {k: len(v) for k, v in sorted(by_cause.items())} }"
    )


def test_switching_rail_never_fixes_an_empty_account(
    by_cause: dict[str, list[FailureLabel]],
) -> None:
    """Exact zero, and it has to be exact.

    An insufficient-funds decline is a fact about the payer's account at that
    moment. Asking a different bank for the same money at the same instant
    cannot succeed. If this rate were even slightly above zero, the balance
    draw would be keyed by something rail-specific, and a policy would learn
    that switching rails conjures money -- the single most expensive wrong
    lesson in the dataset.
    """
    labels = by_cause["insufficient_funds"]
    rate = _rate(labels, ActionKind.SWITCH_RAIL, 0.0)
    assert rate == 0.0, (
        f"switching rail recovered {rate:.4f} of insufficient-funds declines with no "
        "delay. Balance must be keyed to the payer and the moment, not the rail."
    )


def test_waiting_fixes_an_empty_account(by_cause: dict[str, list[FailureLabel]]) -> None:
    """The salary cycle has to be visible in the labels, not just the model."""
    labels = by_cause["insufficient_funds"]
    immediate = _rate(labels, ActionKind.RETRY_SAME_RAIL, 0.0)
    delayed = _rate(labels, ActionKind.RETRY_SAME_RAIL, _longest_offset(labels))
    assert immediate == 0.0, (
        f"an immediate retry recovered {immediate:.4f} of insufficient-funds declines. "
        "Within one balance bucket the account has not changed, so it must be zero."
    )
    assert delayed > 0.10, (
        f"waiting recovered only {delayed:.4f} of insufficient-funds declines. "
        "Balances move; if waiting never helps, the balance state is not being "
        "resampled and the salary cycle carries no signal."
    )


def test_switching_rail_beats_waiting_during_an_outage(
    by_cause: dict[str, list[FailureLabel]],
) -> None:
    """The opposite prescription from the case above, on the same data."""
    labels = by_cause["issuer_unavailable"]
    switch_now = _rate(labels, ActionKind.SWITCH_RAIL, 0.0)
    retry_now = _rate(labels, ActionKind.RETRY_SAME_RAIL, 0.0)
    assert switch_now > retry_now, (
        f"during an outage, switching rail recovered {switch_now:.4f} and retrying the "
        f"same rail {retry_now:.4f}. Switching should be clearly better."
    )
    assert switch_now > 0.5, (
        f"switching away from a dead issuer recovered only {switch_now:.4f}; the "
        "alternative rails are evidently not healthy independently of it"
    )


def test_waiting_out_an_outage_also_works(by_cause: dict[str, list[FailureLabel]]) -> None:
    """Outages end. That is the difference between them and expired mandates."""
    labels = by_cause["issuer_unavailable"]
    immediate = _rate(labels, ActionKind.RETRY_SAME_RAIL, 0.0)
    later = _rate(labels, ActionKind.RETRY_SAME_RAIL, _longest_offset(labels))
    assert later > immediate, (
        f"retrying a downed issuer recovered {immediate:.4f} immediately and "
        f"{later:.4f} much later; recovery over time is what makes an outage "
        "different from a permanent failure"
    )


def test_a_dead_card_is_dead_on_that_rail_forever(
    by_cause: dict[str, list[FailureLabel]],
) -> None:
    """Exact zero on the same rail, at every delay. Waiting cannot help."""
    labels = by_cause["instrument_expired"]
    for counterfactual in (c for label in labels for c in label.counterfactuals):
        if counterfactual.action is not ActionKind.RETRY_SAME_RAIL:
            continue
        assert not counterfactual.would_succeed, (
            "an expired instrument succeeded on retry at offset "
            f"{counterfactual.offset_minutes}; an expired card does not expire less "
            "as time passes"
        )


def test_a_dead_card_can_be_routed_around(by_cause: dict[str, list[FailureLabel]]) -> None:
    labels = by_cause["instrument_expired"]
    switch = _rate(labels, ActionKind.SWITCH_RAIL, 0.0)
    assert switch > 0.2, (
        f"switching away from an expired card recovered only {switch:.4f}. The "
        "customer is still solvent and still has other instruments; if this is "
        "near zero the alternative rails are all cards at the same issuer"
    )


def test_a_dead_mandate_recovers_by_no_action_at_all(
    by_cause: dict[str, list[FailureLabel]],
) -> None:
    """Nothing works, and the oracle has to say so.

    A dataset in which every failure is recoverable by something would let a
    policy retry indiscriminately and never be punished for it. These are the
    rows that make doing nothing the right answer.
    """
    permanent = [
        label
        for cause in ("mandate_expired", "mandate_revoked")
        for label in by_cause.get(cause, [])
    ]
    if not permanent:
        pytest.skip("no mandate failures in this run; lengthen it to exercise this path")

    for label in permanent:
        assert label.is_permanent
        assert not label.oracle.recovers, (
            f"{label.payment_attempt_id} failed with {label.failure_cause} but the "
            "oracle claims an action would have recovered it"
        )
        assert label.oracle.action is ActionKind.NONE
        assert not any(c.would_succeed for c in label.counterfactuals)


def test_the_oracle_picks_the_earliest_recovery(labels: list[FailureLabel]) -> None:
    """Otherwise a policy that always waits three days would score perfectly."""
    for label in labels:
        successes = [c for c in label.counterfactuals if c.would_succeed]
        if not successes:
            assert not label.oracle.recovers
            continue
        assert label.oracle.recovers
        assert label.oracle.offset_minutes == min(c.offset_minutes for c in successes)


def test_not_everything_is_recoverable(labels: list[FailureLabel]) -> None:
    """A sanity bound on the dataset as a whole.

    If the oracle recovered essentially every failure, the ceiling would be
    100% and every policy would be measured against an unreachable and
    uninformative bound.
    """
    recoverable = sum(1 for label in labels if label.oracle.recovers) / len(labels)
    assert 0.3 < recoverable < 0.99, (
        f"the oracle recovers {recoverable:.3f} of failures. Outside this range the "
        "dataset is either trivially easy or offers nothing to recover."
    )


def test_some_failures_recover_with_no_intervention(labels: list[FailureLabel]) -> None:
    """The baseline is non-zero, which is the point of simulating it.

    If nothing recovered on its own, every recovery a policy achieved would
    count as incremental and the measured lift would be inflated by exactly
    the amount this number represents.
    """
    natural = sum(1 for label in labels if label.recovered_naturally_in_window)
    assert natural > 0, (
        "no failure recovered without intervention. Customer self-retry and merchant "
        "dunning are not producing successes, so the Phase 5 baseline would be zero "
        "and every incremental-rupee figure would be overstated."
    )
    fraction = natural / len(labels)
    assert fraction < 0.9, (
        f"{fraction:.3f} of failures recover on their own, leaving almost nothing "
        "for a recovery system to add"
    )
