"""The fitted model must learn from logs, not from the answer key."""

from __future__ import annotations

import pytest

from salvage_eval.baselines.bandit import ContextualBanditPolicy
from salvage_eval.baselines.fitted import FittedPolicy
from salvage_eval.benchmark.runner import BenchmarkRunner
from salvage_eval.benchmark.shadow import compare
from salvage_eval.dataset.split import train_test_split
from salvage_eval.model.fitted_recoverability import FittedRecoverabilityModel
from salvage_eval.types import EvaluatedAction, LoggedEpisode


@pytest.fixture(scope="module")
def episodes() -> list[LoggedEpisode]:
    # 35 days at two merchants: the month span is what matters -- it is what
    # puts episodes in the 20th-27th pre-payday window -- and cost scales with
    # days x merchants, so the merchant count is the cheap dial to turn down.
    return BenchmarkRunner.generate_dataset(seed=13, days=35.0, merchants=1, max_episodes=1500)


def test_the_fitter_never_reads_a_counterfactual(episodes: list[LoggedEpisode]) -> None:
    """The decisive test in this file.

    ``counterfactual_rewards`` and ``counterfactual_recoveries`` hold the
    outcome of every action *not* taken. A model that reads them scores
    beautifully and is worthless, and nothing downstream would notice. This
    strips them from the training copies entirely: if the fitter touches one,
    it raises.
    """
    stripped = [
        episode.model_copy(update={"counterfactual_rewards": {}, "counterfactual_recoveries": {}})
        for episode in episodes[:500]
    ]

    model = FittedRecoverabilityModel.fit(stripped)

    # It fitted successfully from logged fields alone, and produces usable
    # estimates.
    context = episodes[0].context
    probability = model.predict(context, EvaluatedAction.RETRY_SCHEDULED)
    assert 0.0 <= probability <= 1.0


def test_fitting_on_stripped_episodes_gives_the_same_model(
    episodes: list[LoggedEpisode],
) -> None:
    """Stronger form: the counterfactuals make no difference to what is learned."""
    subset = episodes[:800]
    stripped = [
        e.model_copy(update={"counterfactual_rewards": {}, "counterfactual_recoveries": {}})
        for e in subset
    ]

    full_model = FittedRecoverabilityModel.fit(subset)
    stripped_model = FittedRecoverabilityModel.fit(stripped)

    assert full_model.summary() == stripped_model.summary()


def _episode(
    index: int, context: dict, action: EvaluatedAction, recovered: bool
) -> LoggedEpisode:
    return LoggedEpisode(
        episode_id=f"ep_{index}",
        context=context,
        action=action,
        propensity=0.25,
        feasible_actions=[action, EvaluatedAction.NO_ACTION],
        reward_paise=1000,
        is_recovered=recovered,
        counterfactual_rewards={},
        counterfactual_recoveries={},
    )


def test_a_sparse_cell_is_pulled_toward_a_well_populated_parent() -> None:
    """Three lucky observations must not override a thousand contrary ones.

    The pre-payday cell sees 3 recoveries out of 3. The non-pre-payday cell,
    which shares its (action, cause) parent, sees 1000 attempts recover 5% of
    the time. The sparse cell must not come out near 1.0 on that evidence --
    that is the whole reason for shrinking toward a parent.
    """
    action = EvaluatedAction.RETRY_SCHEDULED
    sparse_context = {
        "provider_error_code": "SIM_INSUFFICIENT_FUNDS",
        "is_salary_cycle_pre_payday": True,
    }
    dense_context = {
        "provider_error_code": "SIM_INSUFFICIENT_FUNDS",
        "is_salary_cycle_pre_payday": False,
    }

    episodes = [_episode(i, sparse_context, action, True) for i in range(3)]
    episodes += [_episode(1000 + i, dense_context, action, i % 20 == 0) for i in range(1000)]

    model = FittedRecoverabilityModel.fit(episodes)

    sparse = model.predict(sparse_context, action)
    dense = model.predict(dense_context, action)

    # The dense cell tracks its own data.
    assert dense == pytest.approx(0.05, abs=0.02)
    # The sparse cell is pulled most of the way down to it, rather than
    # asserting the 1.0 its three observations would suggest.
    assert sparse < 0.30
    # But it still moves in the direction its own evidence points.
    assert sparse > dense


def test_a_dense_cell_follows_its_own_data() -> None:
    """With plenty of evidence the estimate tracks the observed rate."""
    context = {"provider_error_code": "SIM_ISSUER_UNAVAILABLE", "is_salary_cycle_pre_payday": False}
    episodes = [
        _episode(i, context, EvaluatedAction.SWITCH_RAIL, i % 10 < 8)  # 80%
        for i in range(2000)
    ]

    model = FittedRecoverabilityModel.fit(episodes)

    assert model.predict(context, EvaluatedAction.SWITCH_RAIL) == pytest.approx(0.80, abs=0.03)


def test_a_permanent_cause_is_zero_regardless_of_what_the_data_says() -> None:
    """A dead mandate fails on every rail at every delay.

    Structural, not learned: a training set with few examples of it must not
    be able to talk the model into retrying one.
    """
    context = {"provider_error_code": "SIM_MANDATE_EXPIRED", "is_salary_cycle_pre_payday": False}
    # Deliberately, impossibly, all recovered.
    episodes = [
        _episode(i, context, EvaluatedAction.RETRY_IMMEDIATE, True) for i in range(500)
    ]

    model = FittedRecoverabilityModel.fit(episodes)

    assert model.predict(context, EvaluatedAction.RETRY_IMMEDIATE) == 0.0


def test_an_unfitted_model_refuses_to_predict() -> None:
    with pytest.raises(RuntimeError, match="not been fitted"):
        FittedRecoverabilityModel().predict({}, EvaluatedAction.RETRY_IMMEDIATE)


def test_the_split_is_deterministic_and_disjoint(episodes: list[LoggedEpisode]) -> None:
    train_a, test_a = train_test_split(episodes)
    train_b, test_b = train_test_split(episodes)

    assert [e.episode_id for e in train_a] == [e.episode_id for e in train_b]
    assert [e.episode_id for e in test_a] == [e.episode_id for e in test_b]

    train_ids = {e.episode_id for e in train_a}
    test_ids = {e.episode_id for e in test_a}
    assert not (train_ids & test_ids)
    assert len(train_ids) + len(test_ids) == len(episodes)


def test_the_split_refuses_to_produce_an_empty_side() -> None:
    with pytest.raises(ValueError, match="too few episodes"):
        train_test_split([], train_fraction=0.7)


def test_the_fitted_model_is_better_calibrated_than_the_hand_written_one(
    episodes: list[LoggedEpisode],
) -> None:
    """The point of Phase 10, stated as an assertion.

    Both policies are scored on the same held-out episodes. The fitted one
    was estimated from the disjoint training half; the hand-written one was
    estimated from a person's intuition. Lower Brier is better.
    """
    train, test = train_test_split(episodes)
    fitted = FittedPolicy(FittedRecoverabilityModel.fit(train))
    hand_written = ContextualBanditPolicy(is_constrained=True)

    fitted_summary = BenchmarkRunner.evaluate_policy(fitted, test, num_bootstraps=20)
    hand_summary = BenchmarkRunner.evaluate_policy(hand_written, test, num_bootstraps=20)

    assert fitted_summary.calibration is not None
    assert hand_summary.calibration is not None
    assert fitted_summary.calibration.brier_score < hand_summary.calibration.brier_score
    assert (
        fitted_summary.calibration.expected_calibration_error
        < hand_summary.calibration.expected_calibration_error
    )


def test_the_paired_comparison_is_tighter_than_two_independent_intervals(
    episodes: list[LoggedEpisode],
) -> None:
    """Pairing cancels the variance the two policies share.

    Both are scored on the same episodes, so most of the spread in each
    separate interval comes from which failures are in the dataset rather than
    from the policies. The paired interval should be materially narrower than
    the width of either policy's own interval.
    """
    train, test = train_test_split(episodes)
    fitted = FittedPolicy(FittedRecoverabilityModel.fit(train))
    hand_written = ContextualBanditPolicy(is_constrained=True)

    result = compare(fitted, hand_written, test, num_bootstraps=200)
    paired_width = result.ci_upper_paise - result.ci_lower_paise

    hand_summary = BenchmarkRunner.evaluate_policy(hand_written, test, num_bootstraps=200)
    independent_width = hand_summary.doubly_robust.ci_upper - hand_summary.doubly_robust.ci_lower

    assert paired_width < independent_width


def test_shadow_reports_disagreement_so_a_null_comparison_is_visible(
    episodes: list[LoggedEpisode],
) -> None:
    """A policy compared against itself differs nowhere and by nothing."""
    _, test = train_test_split(episodes)
    policy = ContextualBanditPolicy(is_constrained=True)

    result = compare(policy, policy, test, num_bootstraps=50)

    assert result.disagreement_rate == 0.0
    assert result.mean_difference_paise == 0.0
    assert not result.distinguishable_from_zero
    assert "not distinguishable from zero" in result.verdict()


def test_shadow_refuses_an_empty_episode_set() -> None:
    policy = ContextualBanditPolicy(is_constrained=True)
    with pytest.raises(ValueError, match="empty episode set"):
        compare(policy, policy, [], num_bootstraps=10)
