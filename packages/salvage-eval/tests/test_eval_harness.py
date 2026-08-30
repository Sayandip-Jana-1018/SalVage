"""End-to-end integration tests for the salvage-eval harness."""

from __future__ import annotations

from pathlib import Path

from salvage_eval.baselines.bandit import ContextualBanditPolicy
from salvage_eval.baselines.never_retry import NeverRetryPolicy
from salvage_eval.baselines.rules_baseline import RulesBaselinePolicy
from salvage_eval.benchmark.reporter import EvaluationReporter
from salvage_eval.benchmark.runner import BenchmarkRunner


def test_end_to_end_evaluation_pipeline(tmp_path: Path) -> None:
    episodes = BenchmarkRunner.generate_dataset(
        seed=42, days=5.0, merchants=4, max_episodes=300
    )
    assert len(episodes) == 300

    policies = [NeverRetryPolicy(), ContextualBanditPolicy(is_constrained=True)]
    summaries = [BenchmarkRunner.evaluate_policy(p, episodes, num_bootstraps=50) for p in policies]

    report_md = EvaluationReporter.render_markdown(
        summaries, num_episodes=len(episodes), random_seed=42
    )
    assert "# EVALUATION.md" in report_md
    assert "Baselines" in report_md
    assert "Doubly Robust" in report_md
    assert "Regret Accounting" in report_md

    out_file = tmp_path / "EVALUATION_TEST.md"
    out_file.write_text(report_md, encoding="utf-8")
    assert len(out_file.read_text(encoding="utf-8")) > 500


def test_a_policy_without_a_recovery_belief_reports_no_calibration() -> None:
    """Absence of a belief is reported as absence, not as a bad score.

    The rules baseline holds no probabilistic belief about recovery. The
    harness used to feed it its own action-selection probability -- always
    1.0, since it is deterministic -- and score that against the recovery
    outcome, producing a Brier score near 1.0 that was read as evidence of a
    badly calibrated model. Nothing was being measured.
    """
    episodes = BenchmarkRunner.generate_dataset(
        seed=7, days=4.0, merchants=3, max_episodes=200
    )
    summary = BenchmarkRunner.evaluate_policy(
        RulesBaselinePolicy(), episodes, num_bootstraps=20
    )

    assert summary.calibration is None

    report = EvaluationReporter.render_markdown([summary], num_episodes=200, random_seed=7)
    assert "states no recovery probability" in report


def test_a_policy_with_a_recovery_belief_is_calibrated_against_outcomes() -> None:
    episodes = BenchmarkRunner.generate_dataset(
        seed=7, days=4.0, merchants=3, max_episodes=200
    )
    summary = BenchmarkRunner.evaluate_policy(
        ContextualBanditPolicy(is_constrained=True), episodes, num_bootstraps=20
    )

    assert summary.calibration is not None
    # A Brier score of exactly 1.0 means every prediction was maximally wrong,
    # which is what the old harness reported when it was comparing a
    # deterministic policy's action probability against a recovery outcome.
    assert 0.0 <= summary.calibration.brier_score < 1.0
    # Predictions land in more than one bin, which a comparison against a
    # constant 1.0 could never produce.
    populated = [d for d in summary.calibration.deciles if d["count"] > 0]
    assert len(populated) >= 2


def test_the_unscorable_action_rate_is_reported_rather_than_assumed_zero() -> None:
    """The policy can choose an action the simulator cannot score.

    CUSTOMER_NUDGE has no ground truth anywhere in this repository. The
    harness masks it away before scoring, which means it evaluates a
    different policy from the one that would run. How often that happens is
    reported so the blind spot is visible.
    """
    episodes = BenchmarkRunner.generate_dataset(
        seed=11, days=4.0, merchants=3, max_episodes=200
    )
    rate = BenchmarkRunner.unscorable_action_rate(
        ContextualBanditPolicy(is_constrained=True), episodes
    )
    assert 0.0 <= rate <= 1.0
