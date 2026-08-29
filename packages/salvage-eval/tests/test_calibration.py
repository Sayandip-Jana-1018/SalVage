"""Unit tests for probabilistic calibration diagnostics."""

from __future__ import annotations

from salvage_eval.diagnostics.calibration import CalibrationDiagnostic


def test_perfect_calibration_produces_zero_ece_and_expected_brier_score() -> None:
    preds = [0.8] * 100
    # 80 True, 20 False
    actuals = [True] * 80 + [False] * 20

    cal = CalibrationDiagnostic.evaluate(preds, actuals, num_bins=10)

    assert cal.expected_calibration_error == 0.0
    # Expected brier score for 80% / 20% split
    expected_brier = 0.8 * (0.8 - 1.0) ** 2 + 0.2 * (0.8 - 0.0) ** 2
    assert abs(cal.brier_score - expected_brier) < 1e-4
    assert len(cal.deciles) == 10
