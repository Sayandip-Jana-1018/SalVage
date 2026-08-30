"""Effective Sample Size (ESS) diagnostic utilities."""

from __future__ import annotations

import numpy as np
import numpy.typing as npt


class ESSDiagnostic:
    """Calculates Kish's Effective Sample Size and produces diagnostic warnings."""

    @classmethod
    def calculate_ess(cls, weights: npt.NDArray[np.float64]) -> float:
        """Computes Kish's ESS: (sum(w))^2 / sum(w^2)."""
        sum_w = float(np.sum(weights))
        sum_w_sq = float(np.sum(weights**2))
        if sum_w_sq <= 0:
            return 0.0
        return float((sum_w**2) / sum_w_sq)

    @classmethod
    def check_ess_health(cls, ess: float, total_samples: int) -> str | None:
        """Returns a diagnostic warning string if ESS is critically depressed."""
        if total_samples <= 0:
            return "Empty sample set"
        ratio = ess / total_samples
        if ratio < 0.05:
            return (
                f"CRITICAL: Extreme importance weight variance. "
                f"ESS is {ess:.1f} / {total_samples} ({ratio:.1%}). "
                f"Estimates may have high variance."
            )
        if ratio < 0.15:
            return (
                f"WARNING: Low overlap between logging and target policy. "
                f"ESS is {ess:.1f} / {total_samples} ({ratio:.1%})."
            )
        return None
