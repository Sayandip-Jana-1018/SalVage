"""Unit tests for hindsight regret accounting."""

from __future__ import annotations

from salvage_eval.diagnostics.regret import RegretAccountant
from salvage_eval.types import EvaluatedAction, LoggedEpisode


def test_regret_decomposition_conservation_invariant() -> None:
    # Construct an episode where:
    # - RETRY_IMMEDIATE gives 100,000 (unfeasible due to bounds)
    # - RETRY_SCHEDULED gives 80,000 (feasible, optimal in feasible set)
    # - NO_ACTION gives 0 (chosen by policy)
    ep = LoggedEpisode(
        episode_id="ep_r1",
        context={},
        action=EvaluatedAction.NO_ACTION,
        propensity=0.5,
        feasible_actions=[EvaluatedAction.RETRY_SCHEDULED, EvaluatedAction.NO_ACTION],
        reward_paise=0,
        is_recovered=False,
        counterfactual_rewards={
            EvaluatedAction.RETRY_IMMEDIATE.value: 100000,
            EvaluatedAction.RETRY_SCHEDULED.value: 80000,
            EvaluatedAction.NO_ACTION.value: 0,
        },
    )

    reg = RegretAccountant.decompose([ep], [EvaluatedAction.NO_ACTION])

    assert reg.optimal_value == 100000.0
    assert reg.achieved_value == 0.0
    assert reg.total_regret == 100000.0
    assert reg.bounds_refusal_regret == 20000.0  # 100,000 - 80,000
    assert reg.model_error_regret == 80000.0     # 80,000 - 0
    # Invariant: Total Regret == Bounds Refusal + Model Error
    assert abs(reg.total_regret - (reg.bounds_refusal_regret + reg.model_error_regret)) < 1e-4
