"""Non-parametric bootstrap confidence interval engine."""

from __future__ import annotations

import numpy as np

from salvage_eval.estimators.direct_method import DirectMethodEstimator
from salvage_eval.estimators.doubly_robust import DoublyRobustEstimator
from salvage_eval.estimators.ips import IPSEstimator
from salvage_eval.estimators.snips import SNIPSEstimator
from salvage_eval.types import EstimatorResult, EvaluatedAction, LoggedEpisode


class BootstrapEngine:
    """Computes bootstrap confidence intervals and standard errors for off-policy estimators."""

    @classmethod
    def bootstrap_estimator(
        cls,
        estimator_type: str,
        episodes: list[LoggedEpisode],
        target_policy_probs: list[dict[EvaluatedAction, float]],
        num_bootstraps: int = 200,
        random_seed: int = 42,
    ) -> EstimatorResult:
        """Runs non-parametric bootstrap over logged episodes."""
        n = len(episodes)
        rng = np.random.default_rng(random_seed)

        if estimator_type == "IPS":
            point_est, _, ess, is_ident = IPSEstimator().estimate(episodes, target_policy_probs)
        elif estimator_type == "SNIPS":
            point_est, _, ess, is_ident = SNIPSEstimator().estimate(episodes, target_policy_probs)
        elif estimator_type == "Direct Method":
            point_est, _ = DirectMethodEstimator().estimate(episodes, target_policy_probs)
            ess = float(n)
            is_ident = True
        elif estimator_type == "Doubly Robust":
            point_est, _, ess, is_ident = DoublyRobustEstimator().estimate(
                episodes, target_policy_probs
            )
        else:
            raise ValueError(f"Unknown estimator: {estimator_type}")

        # Resample
        boot_estimates = np.zeros(num_bootstraps, dtype=np.float64)
        for b in range(num_bootstraps):
            indices = rng.integers(0, n, size=n)
            resampled_episodes = [episodes[idx] for idx in indices]
            resampled_probs = [target_policy_probs[idx] for idx in indices]

            if estimator_type == "IPS":
                val, _, _, _ = IPSEstimator().estimate(resampled_episodes, resampled_probs)
            elif estimator_type == "SNIPS":
                val, _, _, _ = SNIPSEstimator().estimate(resampled_episodes, resampled_probs)
            elif estimator_type == "Direct Method":
                val, _ = DirectMethodEstimator().estimate(resampled_episodes, resampled_probs)
            else:
                val, _, _, _ = DoublyRobustEstimator().estimate(resampled_episodes, resampled_probs)

            boot_estimates[b] = val

        ci_lower = float(np.percentile(boot_estimates, 2.5))
        ci_upper = float(np.percentile(boot_estimates, 97.5))
        std_err = float(np.std(boot_estimates, ddof=1))

        diag_warning = None
        if not is_ident:
            diag_warning = "not identifiable — direct method only"
        elif ess < 0.1 * n:
            diag_warning = f"Low effective sample size: {ess:.1f} / {n}"

        return EstimatorResult(
            estimator_name=estimator_type,
            estimated_value=round(point_est, 2),
            ci_lower=round(ci_lower, 2),
            ci_upper=round(ci_upper, 2),
            standard_error=round(std_err, 2),
            effective_sample_size=round(ess, 1),
            is_identifiable=is_ident,
            diagnostics_warning=diag_warning,
        )
