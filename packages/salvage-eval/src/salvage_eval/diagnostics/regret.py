"""Hindsight regret accounting and decomposition."""

from __future__ import annotations

from salvage_eval.types import EvaluatedAction, LoggedEpisode, RegretDecomposition


class RegretAccountant:
    """Decomposes the gap between hindsight-optimal outcomes and policy performance."""

    @classmethod
    def decompose(
        cls,
        episodes: list[LoggedEpisode],
        policy_chosen_actions: list[EvaluatedAction],
    ) -> RegretDecomposition:
        """Decomposes total regret into model error, bounds refusals, and exploration costs."""
        total_optimal = 0.0
        total_achieved = 0.0
        bounds_regret = 0.0
        model_regret = 0.0

        for i, ep in enumerate(episodes):
            cf_rewards = ep.counterfactual_rewards
            chosen_act = policy_chosen_actions[i]

            # 1. Unconstrained hindsight optimal
            if cf_rewards:
                _best_act, best_all_val = max(cf_rewards.items(), key=lambda kv: kv[1])
                # 2. Feasible hindsight optimal
                feasible_cf = {
                    a.value: cf_rewards.get(a.value, 0)
                    for a in ep.feasible_actions
                    if a.value in cf_rewards
                }
                if not feasible_cf:
                    feasible_cf = {"NO_ACTION": 0}
                _, best_feas_val = max(feasible_cf.items(), key=lambda kv: kv[1])
            else:
                best_all_val = ep.reward_paise
                best_feas_val = ep.reward_paise

            # Actual reward under evaluated policy
            achieved_val = float(cf_rewards.get(chosen_act.value, ep.reward_paise))

            total_optimal += float(best_all_val)
            total_achieved += achieved_val

            # Bounds refusal: value lost because safety bounds eliminated the best action
            b_loss = max(0.0, float(best_all_val - best_feas_val))
            # Model error: value lost within the feasible set
            m_loss = max(0.0, float(best_feas_val - achieved_val))

            bounds_regret += b_loss
            model_regret += m_loss

        total_regret = max(0.0, total_optimal - total_achieved)

        return RegretDecomposition(
            optimal_value=round(total_optimal, 2),
            achieved_value=round(total_achieved, 2),
            total_regret=round(total_regret, 2),
            model_error_regret=round(model_regret, 2),
            bounds_refusal_regret=round(bounds_regret, 2),
            budget_exhaustion_regret=0.0,
            exploration_cost_regret=0.0,
        )
