"""Markdown report generator for EVALUATION.md."""

from __future__ import annotations

from typing import Any

from salvage_eval.benchmark.shadow import ShadowComparison
from salvage_eval.types import PolicyEvaluationSummary


class EvaluationReporter:
    """Renders evaluation summaries into EVALUATION.md."""

    @staticmethod
    def _headline(
        summaries: list[PolicyEvaluationSummary],
        salvage: PolicyEvaluationSummary,
        paired: ShadowComparison | None = None,
    ) -> list[str]:
        """State the comparison a reader would otherwise have to compute.

        The question this whole harness exists to answer is whether the policy
        earns its complexity against the best simple alternative. Leaving that
        to the reader invites them to compare against the *weakest* baseline,
        which is the flattering comparison and not the informative one.

        Everything below is computed from the summaries. Whether the intervals
        overlap is a fact about the numbers, not a judgement about them.
        """
        # Baselines only. The unconstrained bandit is the same policy with the
        # bounds switched off, and the fitted policy is the challenger that
        # section 3 compares properly -- neither is a "simple alternative", and
        # calling one that here would answer a different question.
        rivals = [
            s
            for s in summaries
            if s is not salvage
            and "Unconstrained" not in s.policy_name
            and "Fitted" not in s.policy_name
        ]
        if not rivals:
            return []

        best = max(rivals, key=lambda s: s.ground_truth_value)
        margin = salvage.ground_truth_value - best.ground_truth_value
        rate_margin = salvage.ground_truth_recovery_rate - best.ground_truth_recovery_rate

        ours, theirs = salvage.doubly_robust, best.doubly_robust
        overlap = ours.ci_lower <= theirs.ci_upper and theirs.ci_lower <= ours.ci_upper

        verdict = (
            (
                "**The confidence intervals overlap, so this margin is not "
                "statistically distinguishable from zero on this dataset.** The "
                "policy is not shown to beat the best simple baseline; it is shown "
                "not to lose to it."
            )
            if overlap
            else (
                "The confidence intervals do not overlap, so the margin is "
                "distinguishable from zero on this dataset."
            )
        )

        lines = [
            "### Headline",
            "",
            (
                f"Against the strongest baseline here (**{best.policy_name}**), "
                f"{salvage.policy_name} recovers "
                f"{salvage.ground_truth_recovery_rate:.1%} against "
                f"{best.ground_truth_recovery_rate:.1%} "
                f"({rate_margin:+.1%}) and returns {margin:+,.1f} paise per failure."
            ),
            "",
        ]

        if paired is not None:
            # The test that actually settles it. Both policies scored on the
            # same episodes, so the shared variance cancels.
            lines.extend(
                [
                    (
                        f"**Paired test:** {paired.mean_difference_paise:+,.1f} paise per "
                        f"failure, 95% CI [{paired.ci_lower_paise:+,.1f}, "
                        f"{paired.ci_upper_paise:+,.1f}] — {paired.verdict()}. "
                        f"They chose different actions on "
                        f"{paired.disagreement_rate:.1%} of episodes."
                    ),
                    "",
                ]
            )

        lines.extend(
            [
                "The unpaired view, for comparison:",
                "",
                (
                    f"- {salvage.policy_name}: DR "
                    f"`{ours.estimated_value:,.1f}` [{ours.ci_lower:,.1f}, {ours.ci_upper:,.1f}]"
                ),
                (
                    f"- {best.policy_name}: DR "
                    f"`{theirs.estimated_value:,.1f}` "
                    f"[{theirs.ci_lower:,.1f}, {theirs.ci_upper:,.1f}]"
                ),
                "",
                verdict,
                "",
                (
                    "> Where the paired test and the overlap test disagree, the paired "
                    "one is right. See section 3."
                ),
                "",
            ]
        )
        return lines

    @staticmethod
    def _shadow(shadow: ShadowComparison) -> list[str]:
        """The paired comparison, which is the statistically correct one.

        The headline above compares two independent confidence intervals and
        checks whether they overlap. That test is under-powered here: both
        policies are scored on the same episodes, so most of the variance in
        each estimate is shared and an overlap test throws it away. This
        section resamples once and computes both policies on the same
        resample, so the shared variance cancels.
        """
        arrow = "ahead" if shadow.mean_difference_paise >= 0 else "behind"
        lines = [
            "## 3. Shadow mode: challenger against champion",
            "",
            (
                "How a merchant would actually decide whether to switch policies. "
                f"**{shadow.challenger_name}** decided on the same "
                f"{shadow.n_episodes:,} held-out failures as "
                f"**{shadow.champion_name}**, took no action, and the two are "
                "compared on the outcomes."
            ),
            "",
            (
                f"- They chose **different actions on {shadow.disagreement_rate:.1%}** "
                "of episodes."
            ),
            (
                f"- Challenger: `{shadow.challenger_value_paise:,.1f}` paise per "
                f"failure. Champion: `{shadow.champion_value_paise:,.1f}`."
            ),
            (
                f"- Paired difference: **{shadow.mean_difference_paise:+,.1f} paise** "
                f"per failure, 95% CI "
                f"[{shadow.ci_lower_paise:+,.1f}, {shadow.ci_upper_paise:+,.1f}]."
            ),
            (
                f"- The challenger came out {arrow} in "
                f"{shadow.challenger_better_fraction:.1%} of bootstrap resamples."
            ),
            "",
            f"**Verdict: {shadow.verdict()}.**",
            "",
        ]

        if shadow.disagreement_rate < 0.02:
            lines.extend(
                [
                    (
                        "> The two policies agree on almost every episode, so this "
                        "comparison is measuring very little regardless of how tight "
                        "the interval looks. A difference in probabilities that never "
                        "changes a decision cannot change an outcome."
                    ),
                    "",
                ]
            )

        lines.extend(
            [
                (
                    "> This is a **paired** bootstrap: one resample of episodes, both "
                    "policies scored on it, and the mean of the per-episode difference "
                    "bootstrapped. Comparing two separate intervals and checking for "
                    "overlap -- which section 2 does -- discards the variance the two "
                    "policies share and is badly under-powered. Two policies can have "
                    "heavily overlapping intervals while one beats the other almost "
                    "everywhere."
                ),
                "",
            ]
        )
        return lines

    @staticmethod
    def _fitted_cells(cells: list[dict[str, Any]]) -> list[str]:
        """Print what the fitted model learned, cell by cell.

        A model an operator cannot interrogate is one they cannot overrule.
        Every row here can be recomputed by hand from the trial count and the
        observed rate, which is the point of using shrinkage over something
        with more capacity and less to say for itself.
        """
        lines = [
            "## 6. What the fitted model learned",
            "",
            (
                "Estimated from the **training** episodes only, and only from what a "
                "production log contains: the action taken and whether it worked. The "
                "counterfactual outcomes of the actions *not* taken are the answer key "
                "and the fitter never sees them."
            ),
            "",
            (
                "`fitted` is the observed rate shrunk toward the coarser "
                "(action, cause) estimate by a pseudo-count of 20, so a sparse cell "
                "falls back rather than asserting a confident 0.0 or 1.0 from three "
                "observations."
            ),
            "",
            "| Action | Observed cause | Pre-payday | Trials | Observed rate | Fitted |",
            "|---|---|---|---|---|---|",
        ]
        for cell in cells:
            lines.append(
                f"| {cell['action']} | {cell['observed_cause']} | "
                f"{'yes' if cell['pre_payday'] else 'no'} | {cell['trials']:,} | "
                f"{cell['observed_rate']:.3f} | {cell['fitted_probability']:.3f} |"
            )
        lines.append("")
        return lines

    @classmethod
    def render_markdown(
        cls,
        summaries: list[PolicyEvaluationSummary],
        num_episodes: int,
        random_seed: int,
        unscorable_action_rate: dict[str, float] | None = None,
        shadow: ShadowComparison | None = None,
        shadow_vs_baseline: ShadowComparison | None = None,
        fitted_cells: list[dict[str, Any]] | None = None,
        train_episodes: int | None = None,
    ) -> str:
        """Format the tables, estimator comparison, calibration and regret accounting."""
        unscorable = unscorable_action_rate or {}
        md: list[str] = [
            "# EVALUATION.md",
            "",
            "> **Automatically generated by `salvage-eval`. Do not edit by hand.**",
            ">",
            (
                f"> {num_episodes:,} **held-out** episodes, simulator seed "
                f"`{random_seed}`."
                + (
                    f" Models were fitted on a disjoint {train_episodes:,} episodes."
                    if train_episodes
                    else ""
                )
            ),
            "",
            "## Framing",
            "",
            (
                "Every figure here is measured on **simulated data** from "
                "`packages/salvage-sim`. Its counterfactuals are queries against the "
                "same materialised causal world that produced the observed failure -- "
                "same world, same mechanism, one thing changed -- which is what makes "
                "them counterfactuals rather than a differently-parameterised story."
            ),
            "",
            (
                "**These numbers describe the simulator's model of reality. They are "
                "not production performance, and no part of this repository has been "
                "run against real payment traffic.**"
            ),
            "",
            (
                "The primary claim is **estimator validation against known ground "
                "truth**: on data where the counterfactual outcome of every action is "
                "known, the off-policy estimators recover the true policy value to "
                "within a reported margin. That is a statement about the evaluation "
                "methodology. It is not a claim that any policy here recovers money."
            ),
            "",
            "### What this evaluation cannot see",
            "",
            (
                "- **Customer nudges are not evaluated.** The simulator models no "
                "customer response to a message, so nothing in this repository knows "
                "whether a nudge would have worked. `CUSTOMER_NUDGE` is excluded from "
                "the evaluable action space rather than given an invented response "
                "model. The production policy can still choose it; the table below "
                "reports how often each policy wanted to."
            ),
            (
                "- **Scheduled retries are scored at a fixed delay.** The delay is "
                "resolved from the observable error code and the calendar by a rule "
                "declared in `calibration.yaml`, applied identically to every policy. "
                "So this measures a policy's choice of *action*, never its choice of "
                "*delay*."
            ),
            (
                "- **The logging policy is uniform over feasible actions.** That is "
                "the best case for estimator identifiability, not a realistic log: "
                "every action carries positive probability, so importance weights stay "
                "bounded. A production log would be far more concentrated and would "
                "leave strata unsupported. The Kish effective sample size diagnostic "
                "exists to detect exactly that, and this dataset does not exercise it."
            ),
            "",
        ]

        never_val = next(
            (s.ground_truth_value for s in summaries if "Never" in s.policy_name), 0.0
        )

        md.extend(
            [
                "## 1. Baselines",
                "",
                "| Policy Baseline | True Recovery Rate | Ground Truth Value (₹) | "
                "Incremental ₹ vs Never Retry |",
                "|---|---|---|---|",
            ]
        )
        for s in summaries:
            if any(b in s.policy_name for b in ("Never", "Blind", "Fixed")):
                rupees = s.ground_truth_value / 100.0
                incr = (s.ground_truth_value - never_val) / 100.0
                md.append(
                    f"| **{s.policy_name}** | {s.ground_truth_recovery_rate:.1%} | "
                    f"₹{rupees:,.2f} | {incr:+,.2f} |"
                )
        md.append("")
        md.extend(
            [
                (
                    "> `Never Retry` recovers a non-zero share of payments. That is not "
                    "a bug: an order can resolve on its own inside the attribution "
                    "window -- the customer tries again, the issuer comes back -- and "
                    "the simulator labels that honestly. Every other policy's "
                    "incremental value is measured against it, so any action that only "
                    "captures recoveries which would have happened anyway scores zero."
                ),
                "",
            ]
        )

        md.extend(
            [
                "## 2. Policy Performance",
                "",
                "| Policy | True Recovery Rate | Ground Truth Mean Payoff | "
                "Doubly Robust Estimate [95% CI] | Wanted an unscorable action |",
                "|---|---|---|---|---|",
            ]
        )
        for s in summaries:
            dr = s.doubly_robust
            rate = unscorable.get(s.policy_name)
            rate_cell = "—" if rate is None else f"{rate:.1%}"
            md.append(
                f"| **{s.policy_name}** | {s.ground_truth_recovery_rate:.1%} | "
                f"{s.ground_truth_value:,.1f} paise | "
                f"{dr.estimated_value:,.1f} [{dr.ci_lower:,.1f}, {dr.ci_upper:,.1f}] | "
                f"{rate_cell} |"
            )
        md.append("")

        salvage_summary = next(
            (s for s in summaries if "Constrained" in s.policy_name), summaries[-1]
        )

        md.extend(cls._headline(summaries, salvage_summary, shadow_vs_baseline))
        if shadow is not None:
            md.extend(cls._shadow(shadow))

        md.extend(
            [
                "## 4. Off-Policy Estimator Comparison",
                "",
                (
                    "Four estimators against known ground truth, for "
                    f"**{salvage_summary.policy_name}**. This is the section the "
                    "harness exists for: if an estimator cannot recover a value we "
                    "already know, it cannot be trusted on data where we do not."
                ),
                "",
                f"**Ground truth target value:** `{salvage_summary.ground_truth_value:,.1f}` paise",
                "",
                "| Estimator | Point Estimate | 95% Bootstrap CI | Standard Error | "
                "Kish ESS | Error vs Truth | Warnings |",
                "|---|---|---|---|---|---|---|",
            ]
        )
        for name, res in [
            ("Direct Method (DM)", salvage_summary.direct_method),
            ("Inverse Propensity (IPS)", salvage_summary.ips),
            ("Self-Normalised IPS (SNIPS)", salvage_summary.snips),
            ("Doubly Robust (DR)", salvage_summary.doubly_robust),
        ]:
            err = res.estimated_value - salvage_summary.ground_truth_value
            warn = res.diagnostics_warning or "Fully identifiable"
            md.append(
                f"| **{name}** | {res.estimated_value:,.1f} | "
                f"[{res.ci_lower:,.1f}, {res.ci_upper:,.1f}] | ±{res.standard_error:,.1f} | "
                f"{res.effective_sample_size:,.1f} | {err:+,.1f} paise | {warn} |"
            )
        md.append("")

        md.extend(["## 5. Calibration & Reliability", ""])
        if salvage_summary.calibration:
            cal = salvage_summary.calibration
            md.extend(
                [
                    (
                        "Measured on **P(recovery | context, action)** for the action "
                        "each policy chose, against whether that action would in fact "
                        "have recovered the payment. Policies that hold no "
                        "probabilistic belief -- the rules and fixed-schedule "
                        "baselines -- report no calibration rather than a fabricated "
                        "one."
                    ),
                    "",
                    f"- **Brier score**: `{cal.brier_score:.4f}` (lower is better, 0 is perfect)",
                    f"- **Expected calibration error**: `{cal.expected_calibration_error:.4f}`",
                    "",
                    "### Reliability by decile",
                    "",
                    "| Decile | Predicted range | Mean predicted P(recovery) | "
                    "Observed recovery rate | Count |",
                    "|---|---|---|---|---|",
                ]
            )
            for d in cal.deciles:
                md.append(
                    f"| {int(d['decile'])} | [{d['bin_lower']:.2f}, {d['bin_upper']:.2f}] | "
                    f"{d['predicted_mean']:.3f} | {d['observed_mean']:.3f} | {int(d['count'])} |"
                )
            md.append("")
            md.extend(
                [
                    (
                        "> Deciles with a count of zero are bins the policy never "
                        "predicts into. They contribute nothing to the calibration "
                        "error and their observed rate is not a measurement."
                    ),
                    "",
                ]
            )
        else:
            md.extend(
                [
                    f"{salvage_summary.policy_name} states no recovery probability, "
                    "so there is nothing to calibrate.",
                    "",
                ]
            )

        md.extend(["## 6. Regret Accounting", ""])
        if salvage_summary.regret:
            reg = salvage_summary.regret
            md.extend(
                [
                    f"- **Hindsight optimal value**: `₹{reg.optimal_value / 100:,.2f}`",
                    f"- **Achieved policy value**: `₹{reg.achieved_value / 100:,.2f}`",
                    f"- **Total regret gap**: `₹{reg.total_regret / 100:,.2f}`",
                    "",
                    "### Gap decomposition",
                    "",
                    (
                        f"- **Model prediction error**: `₹{reg.model_error_regret / 100:,.2f}` "
                        "— imperfect ranking of the actions that were available"
                    ),
                    (
                        f"- **Safety bounds refusal**: `₹{reg.bounds_refusal_regret / 100:,.2f}` "
                        "— value deliberately given up to hold the attempt cap"
                    ),
                    f"- **Budget exhaustion**: `₹{reg.budget_exhaustion_regret / 100:,.2f}`",
                    f"- **Exploration cost**: `₹{reg.exploration_cost_regret / 100:,.2f}`",
                    "",
                ]
            )

        if fitted_cells:
            md.extend(cls._fitted_cells(fitted_cells))

        md.extend(
            [
                "## 7. Limitations",
                "",
                (
                    "1. **Simulation, not production.** These figures measure the "
                    "simulator's calibrated transitions. Its parameters are documented "
                    "in `packages/salvage-sim/calibration.yaml`, and the ones that are "
                    "structural assumptions rather than measurements say so."
                ),
                (
                    "2. **Propensity overlap.** Off-policy estimators require every "
                    "target action to have non-zero probability under the logging "
                    "policy. Actions a hard bound forbids form deterministic strata "
                    "where only the Direct Method is identifiable."
                ),
                (
                    "3. **No customer-response model.** Nudge outcomes are unmodelled "
                    "and unevaluated. See the framing section."
                ),
                (
                    "4. **Action costs are assumptions.** The per-action costs in "
                    "`recovery_actions.cost_paise` are a structural cost model, not "
                    "observed gateway pricing. Nothing here has verified any "
                    "provider's published fees."
                ),
                "",
                (
                    "A previous version of this report carried a section reporting "
                    "cross-tenant detection latency (`38.4s` pooled against `184.2s` "
                    "isolated, with confidence intervals and false-positive rates). "
                    "Those numbers were literals in the report generator. Nothing "
                    "measured them, and the section has been removed rather than "
                    "re-derived."
                ),
                "",
            ]
        )

        return "\n".join(md)
