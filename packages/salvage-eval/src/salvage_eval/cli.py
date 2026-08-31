"""Command-line interface for the salvage-eval off-policy evaluation harness."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from salvage_eval.baselines.bandit import ContextualBanditPolicy
from salvage_eval.baselines.blind_retry import BlindRetryPolicy
from salvage_eval.baselines.fitted import FittedPolicy
from salvage_eval.baselines.fixed_schedule import FixedSchedulePolicy
from salvage_eval.baselines.never_retry import NeverRetryPolicy
from salvage_eval.baselines.rules_baseline import RulesBaselinePolicy
from salvage_eval.benchmark.reporter import EvaluationReporter
from salvage_eval.benchmark.runner import BenchmarkRunner
from salvage_eval.benchmark.shadow import compare as shadow_compare
from salvage_eval.dataset.split import train_test_split
from salvage_eval.model.fitted_recoverability import FittedRecoverabilityModel


def main() -> None:
    """Main CLI entrypoint for salvage-eval."""
    parser = argparse.ArgumentParser(
        prog="salvage-eval",
        description="Off-policy evaluation harness for payment recovery policies.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcommand: report
    report_parser = subparsers.add_parser("report", help="Run benchmark and write EVALUATION.md")
    report_parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=Path("EVALUATION.md"),
        help="Target output file path (default: EVALUATION.md)",
    )
    report_parser.add_argument(
        "--episodes",
        "-n",
        type=int,
        default=5000,
        help="Cap on episodes drawn from the simulated run (default: 5000)",
    )
    report_parser.add_argument(
        "--days",
        type=float,
        default=35.0,
        help=(
            "Simulated days of merchant traffic (default: 35). Must span a whole "
            "month: at 14 days the run never reached the 20th-27th pre-payday "
            "window, so the salary-cycle feature was never once exercised and "
            "every fitted cell read pre_payday=no."
        ),
    )
    report_parser.add_argument(
        "--merchants",
        type=int,
        default=3,
        help=(
            "Number of simulated merchants (default: 3). Kept low because the "
            "run must span a whole month to exercise the salary cycle, and "
            "cost scales with days x merchants; the month is what matters, not "
            "the merchant count."
        ),
    )
    report_parser.add_argument(
        "--bootstraps",
        "-b",
        type=int,
        default=200,
        help="Number of bootstrap resamples for confidence intervals (default: 200)",
    )
    report_parser.add_argument(
        "--seed",
        "-s",
        type=int,
        default=42,
        help="Random seed for reproducibility (default: 42)",
    )
    report_parser.add_argument(
        "--json",
        "-j",
        type=Path,
        default=None,
        help=(
            "Also write the same results as JSON. The operator console reads this file "
            "so that it displays measured results rather than a transcription of them."
        ),
    )

    args = parser.parse_args()

    if args.command == "report":
        print(
            f"Simulating {args.days:g} days across {args.merchants} merchants "
            f"(seed={args.seed}, cap {args.episodes:,} episodes)..."
        )
        episodes = BenchmarkRunner.generate_dataset(
            seed=args.seed,
            days=args.days,
            merchants=args.merchants,
            max_episodes=args.episodes,
        )
        print(f"  {len(episodes):,} failures observed and logged.")

        # Fitted on train, scored on test, and every policy is scored on the
        # same held-out set so the comparison is like for like. A model scored
        # on the episodes it was fitted on looks calibrated whatever it has
        # learned.
        train, test = train_test_split(episodes)
        print(f"  {len(train):,} train / {len(test):,} held-out episodes.")

        fitted_model = FittedRecoverabilityModel.fit(train)
        print(f"  Fitted recovery model over {len(fitted_model.summary())} populated cells.")

        champion = ContextualBanditPolicy(is_constrained=True)
        challenger = FittedPolicy(fitted_model, is_constrained=True)

        policies = [
            NeverRetryPolicy(),
            BlindRetryPolicy(),
            FixedSchedulePolicy(),
            RulesBaselinePolicy(),
            ContextualBanditPolicy(is_constrained=False),
            champion,
            challenger,
        ]

        summaries = []
        unscorable: dict[str, float] = {}
        for pol in policies:
            print(f"  Evaluating {pol.name}...")
            summary = BenchmarkRunner.evaluate_policy(
                policy=pol,
                episodes=test,
                num_bootstraps=args.bootstraps,
            )
            summaries.append(summary)
            unscorable[pol.name] = BenchmarkRunner.unscorable_action_rate(pol, test)

        print("  Running the fitted policy in shadow against the hand-written one...")
        shadow = shadow_compare(challenger, champion, test, num_bootstraps=args.bootstraps)

        # The headline question -- does the policy earn its complexity against
        # the best simple alternative? -- deserves the paired test too, not
        # just the overlap check. Fixed Schedule Retry is the strongest
        # baseline the harness has.
        print("  Comparing the policy against the strongest simple baseline...")
        against_baseline = shadow_compare(
            champion, FixedSchedulePolicy(), test, num_bootstraps=args.bootstraps
        )

        print("Formatting EVALUATION.md report...")
        report_content = EvaluationReporter.render_markdown(
            summaries=summaries,
            num_episodes=len(test),
            random_seed=args.seed,
            unscorable_action_rate=unscorable,
            shadow=shadow,
            shadow_vs_baseline=against_baseline,
            fitted_cells=fitted_model.summary(),
            train_episodes=len(train),
        )

        args.output.write_text(report_content, encoding="utf-8")
        print(f"Report successfully written to {args.output.resolve()}")

        if args.json is not None:
            # The same summaries the Markdown was rendered from, serialised
            # rather than re-derived. The operator console reads this file, and
            # a second computation of the same numbers is a second thing that
            # can disagree with the report.
            payload = {
                "generated_at": dt.datetime.now(dt.UTC).isoformat(),
                "episodes": len(test),
                "train_episodes": len(train),
                "simulated_days": args.days,
                "simulated_merchants": args.merchants,
                "unscorable_action_rate": unscorable,
                "bootstraps": args.bootstraps,
                "seed": args.seed,
                "data_source": "salvage-sim",
                "framing": (
                    "Measured on episodes generated by packages/salvage-sim, whose "
                    "counterfactuals are queries against the same causal world that "
                    "produced the observed failure. These figures describe the "
                    "simulator's model of reality, not production performance."
                ),
                "policies": [summary.model_dump(mode="json") for summary in summaries],
                "policy_vs_best_baseline": {
                    "challenger": against_baseline.challenger_name,
                    "champion": against_baseline.champion_name,
                    "mean_difference_paise": round(against_baseline.mean_difference_paise, 2),
                    "ci_lower_paise": round(against_baseline.ci_lower_paise, 2),
                    "ci_upper_paise": round(against_baseline.ci_upper_paise, 2),
                    "disagreement_rate": against_baseline.disagreement_rate,
                    "distinguishable_from_zero": against_baseline.distinguishable_from_zero,
                },
                "shadow_comparison": {
                    "challenger": shadow.challenger_name,
                    "champion": shadow.champion_name,
                    "mean_difference_paise": round(shadow.mean_difference_paise, 2),
                    "ci_lower_paise": round(shadow.ci_lower_paise, 2),
                    "ci_upper_paise": round(shadow.ci_upper_paise, 2),
                    "disagreement_rate": shadow.disagreement_rate,
                    "distinguishable_from_zero": shadow.distinguishable_from_zero,
                },
                "fitted_model_cells": fitted_model.summary(),
            }
            args.json.write_text(
                json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
            print(f"Machine-readable results written to {args.json.resolve()}")

        sys.exit(0)


if __name__ == "__main__":
    main()
