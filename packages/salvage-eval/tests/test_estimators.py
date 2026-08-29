"""Unit tests for statistical off-policy estimators."""

from __future__ import annotations

import numpy as np

from salvage_eval.estimators.direct_method import DirectMethodEstimator
from salvage_eval.estimators.doubly_robust import DoublyRobustEstimator
from salvage_eval.estimators.ips import IPSEstimator
from salvage_eval.estimators.snips import SNIPSEstimator
from salvage_eval.types import EvaluatedAction, LoggedEpisode


def _generate_synthetic_test_episodes(n: int = 2000, seed: int = 123) -> list[LoggedEpisode]:
    rng = np.random.default_rng(seed)
    episodes: list[LoggedEpisode] = []

    for i in range(n):
        tax = rng.choice(["TIMEOUT", "FUNDS", "OUTAGE"])
        # Action space
        actions = list(EvaluatedAction)
        p_uniform = 1.0 / len(actions)

        # True latent reward model: Y(a)
        cf_rewards: dict[str, int] = {}
        for a in actions:
            if a == EvaluatedAction.RETRY_IMMEDIATE:
                base = 80000 if tax == "TIMEOUT" else 5000
            elif a == EvaluatedAction.RETRY_SCHEDULED:
                base = 75000 if tax == "FUNDS" else 20000
            elif a == EvaluatedAction.SWITCH_RAIL:
                base = 85000 if tax == "OUTAGE" else 10000
            else:
                base = 0
            # Add small random noise
            noise = int(rng.integers(-500, 500))
            cf_rewards[a.value] = base + noise

        # Logged action from uniform logger
        sampled_act = actions[int(rng.integers(0, len(actions)))]
        reward = cf_rewards[sampled_act.value]

        episodes.append(
            LoggedEpisode(
                episode_id=f"t_{i}",
                context={"taxonomy_code": tax, "amount_paise": 100000},
                action=sampled_act,
                propensity=p_uniform,
                reward_paise=reward,
                is_recovered=reward > 0,
                counterfactual_rewards=cf_rewards,
            )
        )

    return episodes


def test_estimators_recover_ground_truth_policy_value() -> None:
    episodes = _generate_synthetic_test_episodes(n=3000, seed=42)

    # Target policy: choose RETRY_IMMEDIATE always
    target_probs = [{EvaluatedAction.RETRY_IMMEDIATE: 1.0} for _ in episodes]

    # Calculate true ground-truth value on held-out data
    imm_act = EvaluatedAction.RETRY_IMMEDIATE.value
    true_values = [ep.counterfactual_rewards[imm_act] for ep in episodes]
    ground_truth_mean = float(np.mean(true_values))

    # Evaluate IPS
    ips_est, _, ess, is_ident = IPSEstimator().estimate(episodes, target_probs)
    assert is_ident
    assert ess > 0.1 * len(episodes)
    assert abs(ips_est - ground_truth_mean) / ground_truth_mean < 0.10  # within 10% error margin

    # Evaluate SNIPS
    snips_est, _, _, _ = SNIPSEstimator().estimate(episodes, target_probs)
    assert abs(snips_est - ground_truth_mean) / ground_truth_mean < 0.10

    # Evaluate Direct Method
    dm_est, _ = DirectMethodEstimator().estimate(episodes, target_probs)
    assert abs(dm_est - ground_truth_mean) / ground_truth_mean < 0.10

    # Evaluate Doubly Robust
    dr_est, _, _, _ = DoublyRobustEstimator().estimate(episodes, target_probs)
    assert abs(dr_est - ground_truth_mean) / ground_truth_mean < 0.10
