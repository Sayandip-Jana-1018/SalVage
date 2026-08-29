"""Model probability calibration metrics, reliability curves, and Brier scores."""

from __future__ import annotations

import numpy as np

from salvage_eval.types import CalibrationMetrics


class CalibrationDiagnostic:
    """Computes Brier scores, Expected Calibration Error, and decile reliability tables."""

    @classmethod
    def evaluate(
        cls,
        predicted_probs: list[float],
        actual_outcomes: list[bool],
        num_bins: int = 10,
    ) -> CalibrationMetrics:
        """Evaluates probabilistic calibration on binary recovery outcomes."""
        y_true = np.array(actual_outcomes, dtype=np.float64)
        y_pred = np.array(predicted_probs, dtype=np.float64)

        # 1. Brier score = 1/N * sum((pred - actual)^2)
        brier_score = float(np.mean((y_pred - y_true) ** 2))

        # 2. Decile binning
        bins = np.linspace(0.0, 1.0, num_bins + 1)
        deciles: list[dict[str, float]] = []
        ece = 0.0
        n_total = len(predicted_probs)

        for b in range(num_bins):
            low, high = bins[b], bins[b + 1]
            if b == num_bins - 1:
                mask = (y_pred >= low) & (y_pred <= high)
            else:
                mask = (y_pred >= low) & (y_pred < high)

            count = int(np.sum(mask))
            if count > 0:
                mean_pred = float(np.mean(y_pred[mask]))
                mean_actual = float(np.mean(y_true[mask]))
                diff = abs(mean_pred - mean_actual)
                ece += (count / n_total) * diff
            else:
                mean_pred = float((low + high) / 2.0)
                mean_actual = 0.0

            deciles.append(
                {
                    "decile": float(b + 1),
                    "bin_lower": round(float(low), 2),
                    "bin_upper": round(float(high), 2),
                    "predicted_mean": round(mean_pred, 4),
                    "observed_mean": round(mean_actual, 4),
                    "count": float(count),
                }
            )

        return CalibrationMetrics(
            brier_score=round(brier_score, 5),
            expected_calibration_error=round(ece, 5),
            deciles=deciles,
        )
