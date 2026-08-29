"""End-to-end integration tests for the salvage-eval harness."""

from __future__ import annotations

from pathlib import Path

from salvage_eval.baselines.bandit import ContextualBanditPolicy
from salvage_eval.baselines.never_retry import NeverRetryPolicy
from salvage_eval.benchmark.reporter import EvaluationReporter
from salvage_eval.benchmark.runner import BenchmarkRunner


def test_end_to_end_evaluation_pipeline(tmp_path: Path) -> None:
    # 1. Generate synthetic stream
    episodes = BenchmarkRunner.generate_synthetic_dataset(n_episodes=500, random_seed=42)
    assert len(episodes) == 500

    # 2. Evaluate candidate policies
    policies = [
        NeverRetryPolicy(),
        ContextualBanditPolicy(is_constrained=True),
    ]

    summaries = []
    for pol in policies:
        summary = BenchmarkRunner.evaluate_policy(pol, episodes, num_bootstraps=50)
        summaries.append(summary)

    # 3. Format report
    report_md = EvaluationReporter.render_markdown(summaries, num_episodes=500, random_seed=42)
    assert "# EVALUATION.md" in report_md
    assert "Baselines" in report_md
    assert "Doubly Robust" in report_md
    assert "Regret Accounting" in report_md

    # 4. Write output
    out_file = tmp_path / "EVALUATION_TEST.md"
    out_file.write_text(report_md, encoding="utf-8")
    assert out_file.exists()
    assert len(out_file.read_text(encoding="utf-8")) > 500
