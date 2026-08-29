"""Propensity support and overlap diagnostics."""

from __future__ import annotations

from salvage_eval.types import EvaluatedAction, LoggedEpisode


class PropensityOverlapDiagnostic:
    """Evaluates common support across actions and identifies deterministic strata."""

    @classmethod
    def evaluate_overlap(
        cls,
        episodes: list[LoggedEpisode],
        target_policy_probs: list[dict[EvaluatedAction, float]],
    ) -> dict[str, object]:
        """Analyzes common support and flags unidentifiable deterministic strata."""
        unsupported_count = 0
        min_propensity = 1.0
        max_propensity = 0.0

        for i, ep in enumerate(episodes):
            p = ep.propensity
            min_propensity = min(min_propensity, p)
            max_propensity = max(max_propensity, p)

            target_probs = target_policy_probs[i]
            for act, target_p in target_probs.items():
                if target_p > 0 and act == ep.action and p <= 0:
                    unsupported_count += 1

        is_fully_supported = unsupported_count == 0
        warning = None
        if not is_fully_supported:
            warning = (
                f"{unsupported_count} episodes have zero logging support for target actions "
                "(deterministic strata: not identifiable — direct method only)."
            )

        return {
            "is_fully_supported": is_fully_supported,
            "unsupported_episodes": unsupported_count,
            "min_propensity": round(min_propensity, 4),
            "max_propensity": round(max_propensity, 4),
            "warning": warning,
        }
