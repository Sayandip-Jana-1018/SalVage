"""Policy benchmark runner over simulator-generated ground truth."""

from __future__ import annotations

import numpy as np

from salvage_eval.baselines.base import AbstractPolicy
from salvage_eval.benchmark.bootstrap import BootstrapEngine
from salvage_eval.dataset.from_simulator import EVALUABLE_ACTIONS, build_episodes
from salvage_eval.diagnostics.calibration import CalibrationDiagnostic
from salvage_eval.diagnostics.regret import RegretAccountant
from salvage_eval.types import (
    EvaluatedAction,
    LoggedEpisode,
    PolicyEvaluationSummary,
)


class BenchmarkRunner:
    """Runs every policy against one set of logged episodes.

    Episodes come from :mod:`salvage_eval.dataset.from_simulator`, which draws
    ground truth from ``salvage-sim``'s causal world. This class used to
    generate its own episodes inline from a table of hand-written
    probabilities; see that module's docstring for why that was removed.
    """

    @classmethod
    def generate_dataset(
        cls,
        seed: int = 42,
        days: float = 14.0,
        merchants: int = 12,
        max_episodes: int | None = 5000,
    ) -> list[LoggedEpisode]:
        """Simulate a world and log one episode per observed failure."""
        return build_episodes(
            seed=seed, days=days, merchants=merchants, max_episodes=max_episodes
        )

    @classmethod
    def evaluate_policy(
        cls,
        policy: AbstractPolicy,
        episodes: list[LoggedEpisode],
        num_bootstraps: int = 200,
    ) -> PolicyEvaluationSummary:
        """Evaluate one policy across ground truth and all four estimators."""
        target_probs: list[dict[EvaluatedAction, float]] = []
        chosen_actions: list[EvaluatedAction] = []
        gt_rewards: list[float] = []
        gt_recoveries: list[bool] = []

        # Calibration is measured on P(recovery | context, action) -- the
        # policy's belief about the action it actually chose -- against
        # whether that action would in fact have recovered the payment. Only
        # episodes where the policy states a belief contribute.
        calib_predicted: list[float] = []
        calib_observed: list[bool] = []

        for episode in episodes:
            probs = policy.predict_probabilities(episode.context, episode.feasible_actions)
            target_probs.append(probs)

            chosen = policy.choose_action(episode.context, episode.feasible_actions)
            chosen_actions.append(chosen)

            gt_rewards.append(float(episode.counterfactual_rewards.get(chosen.value, 0)))
            recovered = bool(episode.counterfactual_recoveries.get(chosen.value, False))
            gt_recoveries.append(recovered)

            believed = policy.predict_recovery_probability(episode.context, chosen)
            if believed is not None:
                calib_predicted.append(believed)
                calib_observed.append(recovered)

        ips_res = BootstrapEngine.bootstrap_estimator(
            "IPS", episodes, target_probs, num_bootstraps
        )
        snips_res = BootstrapEngine.bootstrap_estimator(
            "SNIPS", episodes, target_probs, num_bootstraps
        )
        dm_res = BootstrapEngine.bootstrap_estimator(
            "Direct Method", episodes, target_probs, num_bootstraps
        )
        dr_res = BootstrapEngine.bootstrap_estimator(
            "Doubly Robust", episodes, target_probs, num_bootstraps
        )

        # None, not a fabricated zero: a rules policy holds no probabilistic
        # belief, and reporting it as badly calibrated would be a different
        # claim from reporting that it makes no prediction.
        calibration = (
            CalibrationDiagnostic.evaluate(calib_predicted, calib_observed)
            if calib_predicted
            else None
        )

        return PolicyEvaluationSummary(
            policy_name=policy.name,
            ground_truth_value=round(float(np.mean(gt_rewards)), 2),
            ground_truth_recovery_rate=round(float(np.mean(gt_recoveries)), 4),
            ips=ips_res,
            snips=snips_res,
            direct_method=dm_res,
            doubly_robust=dr_res,
            calibration=calibration,
            regret=RegretAccountant.decompose(episodes, chosen_actions),
        )

    @classmethod
    def unscorable_action_rate(
        cls,
        policy: AbstractPolicy,
        episodes: list[LoggedEpisode],
    ) -> float:
        """Share of episodes where the policy's first choice has no ground truth.

        The production action space includes ``CUSTOMER_NUDGE``; the simulator
        models no customer response to a message, so nothing in this
        repository can say whether a nudge would have worked. Those choices
        are masked to the feasible set before scoring, which means the harness
        silently evaluates a *different* policy from the one that would run in
        production. This reports how often that substitution happens, so the
        size of the blind spot is visible rather than assumed small.
        """
        if not episodes:
            return 0.0

        unscorable = 0
        for episode in episodes:
            unconstrained = policy.predict_probabilities(
                episode.context, list(EvaluatedAction)
            )
            preferred = max(unconstrained.items(), key=lambda kv: kv[1])[0]
            if preferred not in EVALUABLE_ACTIONS:
                unscorable += 1
        return round(unscorable / len(episodes), 4)
