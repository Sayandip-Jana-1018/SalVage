"""Doubly Robust (DR) off-policy estimator combining Direct Method and IPS."""

from __future__ import annotations

import numpy as np

from salvage_eval.estimators.direct_method import DirectMethodEstimator
from salvage_eval.types import EvaluatedAction, LoggedEpisode


class DoublyRobustEstimator:
    """Combines a conditional mean reward model and propensity weighting for double protection."""

    def __init__(
        self,
        reward_model: DirectMethodEstimator | None = None,
        max_weight: float | None = 50.0,
    ) -> None:
        self.reward_model = reward_model if reward_model is not None else DirectMethodEstimator()
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

        if not self.reward_model._fitted:
            self.reward_model.fit(episodes)

        dr_terms = np.zeros(n, dtype=np.float64)
        weights = np.zeros(n, dtype=np.float64)
        is_identifiable = True

        for i, ep in enumerate(episodes):
            probs = target_policy_probs[i]
            logged_act = ep.action
            logged_p = ep.propensity
            obs_y = float(ep.reward_paise)

            # Direct method component: \sum_a \pi(a|X_i) * \hat{\mu}(X_i, a)
            dm_expected = 0.0
            for act, p in probs.items():
                if p > 0:
                    dm_expected += p * self.reward_model.predict_reward(ep.context, act)

            # IPS residual component: \frac{\pi(A_i|X_i)}{p_i} * (Y_i - \hat{\mu}(X_i, A_i))
            target_p = probs.get(logged_act, 0.0)
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
            pred_observed = self.reward_model.predict_reward(ep.context, logged_act)
            residual = obs_y - pred_observed

            dr_terms[i] = dm_expected + w * residual

        point_est = float(np.mean(dr_terms))
        std_err = float(np.std(dr_terms, ddof=1) / np.sqrt(n))

        sum_w = float(np.sum(weights))
        sum_w_sq = float(np.sum(weights**2))
        ess = (sum_w**2 / sum_w_sq) if sum_w_sq > 0 else 0.0

        return point_est, std_err, ess, is_identifiable
