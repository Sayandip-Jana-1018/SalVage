"""Invariant tests validating the double robustness property."""

from __future__ import annotations

import numpy as np

from salvage_eval.estimators.direct_method import DirectMethodEstimator
from salvage_eval.estimators.doubly_robust import DoublyRobustEstimator
from salvage_eval.types import EvaluatedAction, LoggedEpisode


class BiasedRewardModel(DirectMethodEstimator):
    """Deliberately misspecified / biased reward model."""

    def __init__(self) -> None:
        super().__init__()
        self._fitted = True

    def predict_reward(self, context: dict[str, object], action: EvaluatedAction) -> float:
        return 20000.0  # constant under-estimate vs true 50,000


def test_doubly_robust_remains_unbiased_with_misspecified_reward_model() -> None:
    rng = np.random.default_rng(42)
    n = 2000
    episodes: list[LoggedEpisode] = []

    for i in range(n):
        # 2 actions: RETRY_IMMEDIATE, NO_ACTION
        act = EvaluatedAction.RETRY_IMMEDIATE if rng.random() < 0.5 else EvaluatedAction.NO_ACTION
        p = 0.5
        cf = {
            EvaluatedAction.RETRY_IMMEDIATE.value: 50000,
            EvaluatedAction.NO_ACTION.value: 0,
        }
        r = cf[act.value]
        episodes.append(
            LoggedEpisode(
                episode_id=f"dr_{i}",
                context={"test": True},
                action=act,
                propensity=p,
                reward_paise=r,
                is_recovered=r > 0,
                counterfactual_rewards=cf,
            )
        )

    # Target policy: always choose RETRY_IMMEDIATE (true expected reward = 50,000)
    target_probs = [{EvaluatedAction.RETRY_IMMEDIATE: 1.0} for _ in episodes]

    # Instantiate DR with deliberately broken reward model
    broken_rm = BiasedRewardModel()
    dr = DoublyRobustEstimator(reward_model=broken_rm)

    point_est, _, _, _ = dr.estimate(episodes, target_probs)

    # Because propensities p=0.5 are correct, DR must still recover 50,000 within margin!
    assert abs(point_est - 50000.0) < 3000.0
