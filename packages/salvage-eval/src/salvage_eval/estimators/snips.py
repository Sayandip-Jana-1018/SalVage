"""Self-Normalized Inverse Propensity Scoring (SNIPS / Hajek) off-policy estimator."""

from __future__ import annotations

import numpy as np

from salvage_eval.types import EvaluatedAction, LoggedEpisode


class SNIPSEstimator:
    """Computes Self-Normalized IPS estimate with lower variance than raw IPS."""

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
        rewards = np.zeros(n, dtype=np.float64)
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
            rewards[i] = float(ep.reward_paise)

        sum_w = float(np.sum(weights))
        sum_w_sq = float(np.sum(weights**2))
        ess = (sum_w**2 / sum_w_sq) if sum_w_sq > 0 else 0.0

        if sum_w <= 0.0:
            return 0.0, 0.0, 0.0, is_identifiable

        point_est = float(np.sum(weights * rewards) / sum_w)

        # Standard error using delta method / linearized terms
        linearized = (weights / (sum_w / n)) * (rewards - point_est)
        std_err = float(np.std(linearized, ddof=1) / np.sqrt(n))

        return point_est, std_err, ess, is_identifiable
