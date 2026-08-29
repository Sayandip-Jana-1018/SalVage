"""Command-line interface for the salvage-eval off-policy evaluation harness."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from salvage_eval.baselines.bandit import ContextualBanditPolicy
from salvage_eval.baselines.blind_retry import BlindRetryPolicy
from salvage_eval.baselines.fixed_schedule import FixedSchedulePolicy
from salvage_eval.baselines.never_retry import NeverRetryPolicy
from salvage_eval.baselines.rules_baseline import RulesBaselinePolicy
from salvage_eval.benchmark.reporter import EvaluationReporter
from salvage_eval.benchmark.runner import BenchmarkRunner


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
        help="Number of synthetic held-out episodes (default: 5000)",
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

    args = parser.parse_args()

    if args.command == "report":
        print(
            f"Generating synthetic evaluation stream "
            f"({args.episodes:,} episodes, seed={args.seed})..."
        )
        episodes = BenchmarkRunner.generate_synthetic_dataset(
            n_episodes=args.episodes,
            random_seed=args.seed,
        )

        policies = [
            NeverRetryPolicy(),
            BlindRetryPolicy(),
            FixedSchedulePolicy(),
            RulesBaselinePolicy(),
            ContextualBanditPolicy(is_constrained=False),
            ContextualBanditPolicy(is_constrained=True),
        ]

        summaries = []
        for pol in policies:
            print(f"  Evaluating {pol.name}...")
            summary = BenchmarkRunner.evaluate_policy(
                policy=pol,
                episodes=episodes,
                num_bootstraps=args.bootstraps,
            )
            summaries.append(summary)

        print("Formatting EVALUATION.md report...")
        report_content = EvaluationReporter.render_markdown(
            summaries=summaries,
            num_episodes=args.episodes,
            random_seed=args.seed,
        )

        args.output.write_text(report_content, encoding="utf-8")
        print(f"Report successfully written to {args.output.resolve()}")
        sys.exit(0)


if __name__ == "__main__":
    main()
