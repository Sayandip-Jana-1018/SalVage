"""Inverse Propensity Scoring (Horvitz-Thompson) off-policy estimator."""

from __future__ import annotations

import numpy as np

from salvage_eval.types import EvaluatedAction, LoggedEpisode


class IPSEstimator:
    """Computes Inverse Propensity Scoring estimate with clipping and ESS diagnostics."""

    def __init__(self, max_weight: float | None = 50.0) -> None:
        self.max_weight = max_weight

    def estimate(
        self,
        episodes: list[LoggedEpisode],
        target_policy_probs: list[dict[EvaluatedAction, float]],
    ) -> tuple[float, float, float, bool]:
        """Returns (point_estimate, standard_error, effective_sample_size, is_identifiable)."""
        n = len(episodes)
        if n == 0:
            return 0.0, 0.0, 0.0, True

        weights = np.zeros(n, dtype=np.float64)
        weighted_rewards = np.zeros(n, dtype=np.float64)
        is_identifiable = True

        for i, ep in enumerate(episodes):
            target_p = target_policy_probs[i].get(ep.action, 0.0)
            logged_p = ep.propensity

            if target_p > 0.0 and logged_p <= 0.0:
                is_identifiable = False
                w = 0.0
            elif target_p > 0.0:
                w = target_p / logged_p
                if self.max_weight is not None:
                    w = min(w, self.max_weight)
            else:
                w = 0.0

            weights[i] = w
            weighted_rewards[i] = w * float(ep.reward_paise)

        point_est = float(np.mean(weighted_rewards))
        std_err = float(np.std(weighted_rewards, ddof=1) / np.sqrt(n))

        # Kish's Effective Sample Size: (sum(w))^2 / sum(w^2)
        sum_w = float(np.sum(weights))
        sum_w_sq = float(np.sum(weights**2))
        ess = (sum_w**2 / sum_w_sq) if sum_w_sq > 0 else 0.0

        return point_est, std_err, ess, is_identifiable
