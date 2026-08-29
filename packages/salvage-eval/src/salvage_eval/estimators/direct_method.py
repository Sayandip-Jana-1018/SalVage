"""Direct Method (DM) off-policy estimator using reward model regression."""

from __future__ import annotations

import numpy as np

from salvage_eval.types import EvaluatedAction, LoggedEpisode


class DirectMethodEstimator:
    """Estimates policy value using a conditional mean reward model E[Y | X, A]."""

    def __init__(self) -> None:
        self._action_means: dict[str, float] = {}
        self._fitted: bool = False

    def fit(self, episodes: list[LoggedEpisode]) -> None:
        """Fits stratified conditional reward estimators across (taxonomy_code, action)."""
        strata_totals: dict[tuple[str, str], list[float]] = {}

        for ep in episodes:
            tax = str(ep.context.get("taxonomy_code", "UNKNOWN"))
            key = (tax, ep.action.value)
            if key not in strata_totals:
                strata_totals[key] = []
            strata_totals[key].append(float(ep.reward_paise))

        self._action_means = {
            f"{tax}:{act}": float(np.mean(vals))
            for (tax, act), vals in strata_totals.items()
            if vals
        }
        self._fitted = True

    def predict_reward(self, context: dict[str, object], action: EvaluatedAction) -> float:
        """Predicts expected reward in paise for context X and candidate action A."""
        tax = str(context.get("taxonomy_code", "UNKNOWN"))
        key = f"{tax}:{action.value}"
        if key in self._action_means:
            return self._action_means[key]

        # Fallback to action-wide mean or 0
        matching = [v for k, v in self._action_means.items() if k.endswith(f":{action.value}")]
        return float(np.mean(matching)) if matching else 0.0

    def estimate(
        self,
        episodes: list[LoggedEpisode],
        target_policy_probs: list[dict[EvaluatedAction, float]],
    ) -> tuple[float, float]:
        """Returns point estimate of policy value and standard error."""
        if not self._fitted:
            self.fit(episodes)

        predictions = np.zeros(len(episodes), dtype=np.float64)

        for i, ep in enumerate(episodes):
            probs = target_policy_probs[i]
            expected_i = 0.0
            for act, p in probs.items():
                if p > 0:
                    pred_r = self.predict_reward(ep.context, act)
                    expected_i += p * pred_r
            predictions[i] = expected_i

        point_est = float(np.mean(predictions))
        std_err = float(np.std(predictions, ddof=1) / np.sqrt(len(episodes)))
        return point_est, std_err
