"""Shadow mode: run a challenger beside the champion and measure the difference.

This is how a merchant would ever switch a policy on. The challenger decides
on the same failures the champion decides on, takes no action, and the two are
compared on the outcomes. It answers "would this have been better?" without
anyone having to find out with real money.

Why the comparison is paired
----------------------------

Comparing two policies by their separate confidence intervals and checking
whether those intervals overlap is the wrong test, and it is the one this
harness used to report. Both policies are evaluated on the *same* episodes, so
most of the variance in each estimate is shared -- it comes from which
failures happened to be in the dataset, not from the policies. An overlap test
throws that shared variance away and is badly under-powered: two policies can
have heavily overlapping intervals while one beats the other on nearly every
episode.

The right test resamples episodes once and computes **both** policies on the
same resample, then bootstraps the mean of the per-episode difference. The
shared variance cancels. It is the same reasoning as a paired t-test against a
two-sample one, and it usually produces a much tighter interval on the thing
actually being asked about.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from salvage_eval.baselines.base import AbstractPolicy
from salvage_eval.types import EvaluatedAction, LoggedEpisode


@dataclass(frozen=True, slots=True)
class ShadowComparison:
    """What a challenger would have done differently, and what it would have been worth."""

    challenger_name: str
    champion_name: str
    challenger_value_paise: float
    champion_value_paise: float
    mean_difference_paise: float
    ci_lower_paise: float
    ci_upper_paise: float
    n_episodes: int
    disagreement_rate: float
    """Share of episodes where the two policies chose different actions.

    A challenger that agrees everywhere cannot differ in value, however good
    its probabilities are. A near-zero rate here means the comparison below is
    measuring almost nothing, and the reader should know that before reading
    the interval."""

    challenger_better_fraction: float
    """Share of bootstrap resamples in which the challenger came out ahead."""

    @property
    def distinguishable_from_zero(self) -> bool:
        """True when the interval excludes zero."""
        return self.ci_lower_paise > 0.0 or self.ci_upper_paise < 0.0

    def verdict(self) -> str:
        if not self.distinguishable_from_zero:
            return (
                "not distinguishable from zero on this dataset; the challenger is "
                "not shown to be better or worse"
            )
        if self.mean_difference_paise > 0:
            return "the challenger is ahead by more than the interval's width"
        return "the challenger is behind by more than the interval's width"


def _ground_truth_values(
    policy: AbstractPolicy, episodes: list[LoggedEpisode]
) -> tuple[np.ndarray, list[EvaluatedAction]]:
    """Per-episode payoff of the action this policy would have chosen."""
    chosen: list[EvaluatedAction] = []
    values = np.zeros(len(episodes), dtype=np.float64)
    for index, episode in enumerate(episodes):
        action = policy.choose_action(episode.context, episode.feasible_actions)
        chosen.append(action)
        values[index] = float(episode.counterfactual_rewards.get(action.value, 0))
    return values, chosen


def compare(
    challenger: AbstractPolicy,
    champion: AbstractPolicy,
    episodes: list[LoggedEpisode],
    num_bootstraps: int = 400,
    random_seed: int = 42,
    confidence: float = 0.95,
) -> ShadowComparison:
    """Paired bootstrap comparison of two policies on the same episodes."""
    if not episodes:
        raise ValueError("cannot compare policies on an empty episode set")

    challenger_values, challenger_actions = _ground_truth_values(challenger, episodes)
    champion_values, champion_actions = _ground_truth_values(champion, episodes)
    differences = challenger_values - champion_values

    disagreements = sum(
        1 for a, b in zip(challenger_actions, champion_actions, strict=True) if a != b
    )

    rng = np.random.default_rng(random_seed)
    n = len(episodes)
    boot = np.empty(num_bootstraps, dtype=np.float64)
    for b in range(num_bootstraps):
        # One index draw, applied to both policies. This is the pairing: the
        # resample asks "if these failures had been the dataset, what would
        # the difference have been?", which is the question, rather than
        # "what might each policy have scored independently?", which is not.
        indices = rng.integers(0, n, size=n)
        boot[b] = float(np.mean(differences[indices]))

    tail = (1.0 - confidence) / 2.0
    lower = float(np.percentile(boot, 100.0 * tail))
    upper = float(np.percentile(boot, 100.0 * (1.0 - tail)))

    return ShadowComparison(
        challenger_name=challenger.name,
        champion_name=champion.name,
        challenger_value_paise=float(np.mean(challenger_values)),
        champion_value_paise=float(np.mean(champion_values)),
        mean_difference_paise=float(np.mean(differences)),
        ci_lower_paise=lower,
        ci_upper_paise=upper,
        n_episodes=n,
        disagreement_rate=round(disagreements / n, 4),
        challenger_better_fraction=round(float(np.mean(boot > 0.0)), 4),
    )
