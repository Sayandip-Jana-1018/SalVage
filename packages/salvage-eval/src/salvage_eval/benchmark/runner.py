"""Synthetic evaluation dataset generator and policy benchmark runner."""

from __future__ import annotations

import numpy as np

from salvage_eval.baselines.base import AbstractPolicy
from salvage_eval.benchmark.bootstrap import BootstrapEngine
from salvage_eval.diagnostics.calibration import CalibrationDiagnostic
from salvage_eval.diagnostics.regret import RegretAccountant
from salvage_eval.types import (
    EvaluatedAction,
    LoggedEpisode,
    PolicyEvaluationSummary,
)


class BenchmarkRunner:
    """Orchestrates end-to-end off-policy benchmarking over synthetic ground-truth datasets."""

    @classmethod
    def generate_synthetic_dataset(
        cls,
        n_episodes: int = 5000,
        random_seed: int = 42,
    ) -> list[LoggedEpisode]:
        """Generates synthetic logged episodes with true counterfactuals and propensities."""
        rng = np.random.default_rng(random_seed)
        episodes: list[LoggedEpisode] = []

        taxonomies = [
            "INSUFFICIENT_FUNDS",
            "ISSUER_OUTAGE",
            "NETWORK_TIMEOUT",
            "MANDATE_INVALID",
            "CARD_EXPIRED",
            "CUSTOMER_ABANDONED",
        ]
        tax_weights = [0.35, 0.20, 0.15, 0.10, 0.10, 0.10]
        rails = [
            "HDFC|UPI|RAZORPAY",
            "SBI|UPI|RAZORPAY",
            "ICICI|UPI|RAZORPAY",
            "AXIS|CARD|RAZORPAY",
        ]

        for i in range(n_episodes):
            tax = str(rng.choice(taxonomies, p=tax_weights))
            amount_paise = int(rng.choice([50000, 100000, 250000, 500000, 1000000]))
            hour_ist = int(rng.integers(0, 24))
            day_of_month = int(rng.integers(1, 31))
            is_pre_payday = 20 <= day_of_month <= 27
            attempt_count = int(rng.integers(1, 4))
            rail = str(rng.choice(rails))
            rail_state = "DOWN" if (tax == "ISSUER_OUTAGE" or rng.random() < 0.08) else "HEALTHY"

            context = {
                "taxonomy_code": tax,
                "amount_paise": amount_paise,
                "hour_of_day_ist": hour_ist,
                "day_of_month": day_of_month,
                "is_salary_cycle_pre_payday": is_pre_payday,
                "attempt_count": attempt_count,
                "rail_id": rail,
                "rail_state": rail_state,
            }

            # Safety bounds feasibility
            feasible: list[EvaluatedAction] = []
            if attempt_count < 3:
                feasible.extend(
                    [
                        EvaluatedAction.RETRY_IMMEDIATE,
                        EvaluatedAction.RETRY_SCHEDULED,
                        EvaluatedAction.SWITCH_RAIL,
                    ]
                )
            # Quiet hours 22:00 to 08:00 IST blocks communication nudges
            if not (hour_ist >= 22 or hour_ist < 8):
                feasible.append(EvaluatedAction.CUSTOMER_NUDGE)
            feasible.append(EvaluatedAction.NO_ACTION)

            # Ground truth counterfactual latent recoveries Y(a)
            cf_recoveries: dict[str, bool] = {}
            cf_rewards: dict[str, int] = {}

            # Immediate retry
            p_imm = (
                0.85
                if (tax == "NETWORK_TIMEOUT" and rail_state == "HEALTHY")
                else 0.03
            )
            rec_imm = bool(rng.random() < p_imm)
            cf_recoveries[EvaluatedAction.RETRY_IMMEDIATE.value] = rec_imm
            imm_r = (amount_paise - 50) if rec_imm else -50
            cf_rewards[EvaluatedAction.RETRY_IMMEDIATE.value] = imm_r

            # Scheduled retry
            if tax == "INSUFFICIENT_FUNDS" and is_pre_payday:
                p_sched = 0.80
            elif tax == "ISSUER_OUTAGE":
                p_sched = 0.75
            else:
                p_sched = 0.50
            if tax == "MANDATE_INVALID":
                p_sched = 0.0
            rec_sched = bool(rng.random() < p_sched)
            cf_recoveries[EvaluatedAction.RETRY_SCHEDULED.value] = rec_sched
            sched_r = (amount_paise - 70) if rec_sched else -70
            cf_rewards[EvaluatedAction.RETRY_SCHEDULED.value] = sched_r

            # Switch rail
            p_switch = 0.88 if (tax in ("ISSUER_OUTAGE", "NETWORK_TIMEOUT")) else 0.12
            if tax == "MANDATE_INVALID":
                p_switch = 0.0
            rec_switch = bool(rng.random() < p_switch)
            cf_recoveries[EvaluatedAction.SWITCH_RAIL.value] = rec_switch
            sw_r = (amount_paise - 75) if rec_switch else -75
            cf_rewards[EvaluatedAction.SWITCH_RAIL.value] = sw_r

            # Customer nudge
            if tax in ("CUSTOMER_ABANDONED", "CARD_EXPIRED"):
                p_nudge = 0.70
            elif tax == "INSUFFICIENT_FUNDS":
                p_nudge = 0.60
            else:
                p_nudge = 0.30
            rec_nudge = bool(rng.random() < p_nudge)
            cf_recoveries[EvaluatedAction.CUSTOMER_NUDGE.value] = rec_nudge
            nudge_r = (amount_paise - 200) if rec_nudge else -200
            cf_rewards[EvaluatedAction.CUSTOMER_NUDGE.value] = nudge_r

            # NO_ACTION
            cf_recoveries[EvaluatedAction.NO_ACTION.value] = False
            cf_rewards[EvaluatedAction.NO_ACTION.value] = 0

            # Behavior logging policy: stochastic mixture across feasible actions
            n_feas = len(feasible)
            base_p = 1.0 / n_feas
            propensities = {
                act: (base_p if act in feasible else 0.0)
                for act in EvaluatedAction
            }

            # Sample logged action from logging policy
            sampled_act = feasible[int(rng.integers(0, len(feasible)))]
            sampled_propensity = propensities[sampled_act]
            observed_reward = cf_rewards[sampled_act.value]
            observed_recovery = cf_recoveries[sampled_act.value]

            episodes.append(
                LoggedEpisode(
                    episode_id=f"ep_{i+1:05d}",
                    context=context,
                    action=sampled_act,
                    propensity=round(float(sampled_propensity), 4),
                    feasible_actions=feasible,
                    reward_paise=observed_reward,
                    is_recovered=observed_recovery,
                    counterfactual_rewards=cf_rewards,
                    counterfactual_recoveries=cf_recoveries,
                )
            )

        return episodes

    @classmethod
    def evaluate_policy(
        cls,
        policy: AbstractPolicy,
        episodes: list[LoggedEpisode],
        num_bootstraps: int = 200,
    ) -> PolicyEvaluationSummary:
        """Evaluates a candidate policy across ground truth and all 4 off-policy estimators."""
        target_probs: list[dict[EvaluatedAction, float]] = []
        chosen_actions: list[EvaluatedAction] = []
        gt_rewards: list[float] = []
        gt_recoveries: list[bool] = []
        pred_probs: list[float] = []

        for ep in episodes:
            probs = policy.predict_probabilities(ep.context, ep.feasible_actions)
            target_probs.append(probs)

            chosen = policy.choose_action(ep.context, ep.feasible_actions)
            chosen_actions.append(chosen)

            gt_rewards.append(float(ep.counterfactual_rewards.get(chosen.value, 0)))
            rec = bool(ep.counterfactual_recoveries.get(chosen.value, False))
            gt_recoveries.append(rec)
            pred_probs.append(probs.get(chosen, 0.0))

        gt_mean_val = float(np.mean(gt_rewards))
        gt_mean_rec = float(np.mean(gt_recoveries))

        # 4 Classical Estimators with Bootstrap CIs
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

        # Calibration & Regret
        calib_res = CalibrationDiagnostic.evaluate(pred_probs, gt_recoveries)
        regret_res = RegretAccountant.decompose(episodes, chosen_actions)

        return PolicyEvaluationSummary(
            policy_name=policy.name,
            ground_truth_value=round(gt_mean_val, 2),
            ground_truth_recovery_rate=round(gt_mean_rec, 4),
            ips=ips_res,
            snips=snips_res,
            direct_method=dm_res,
            doubly_robust=dr_res,
            calibration=calib_res,
            regret=regret_res,
        )
