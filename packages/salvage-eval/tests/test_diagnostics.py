"""Unit tests for diagnostic monitors and guardrails."""

from __future__ import annotations

import numpy as np

from salvage_eval.diagnostics.effective_sample_size import ESSDiagnostic
from salvage_eval.diagnostics.propensity_overlap import PropensityOverlapDiagnostic
from salvage_eval.types import EvaluatedAction, LoggedEpisode


def test_ess_diagnostic_calculates_correct_kish_size() -> None:
    # Uniform weights: ESS == N
    uniform_w = np.ones(100)
    ess_unif = ESSDiagnostic.calculate_ess(uniform_w)
    assert abs(ess_unif - 100.0) < 1e-5

    # Degenerate 1-hot weight: ESS == 1
    degen_w = np.zeros(100)
    degen_w[0] = 10.0
    ess_degen = ESSDiagnostic.calculate_ess(degen_w)
    assert abs(ess_degen - 1.0) < 1e-5


def test_ess_diagnostic_triggers_critical_alert_on_low_overlap() -> None:
    warn = ESSDiagnostic.check_ess_health(ess=20.0, total_samples=1000)
    assert warn is not None
    assert "CRITICAL" in warn


def test_propensity_overlap_flags_unsupported_strata() -> None:
    episodes = [
        LoggedEpisode(
            episode_id="ep_1",
            context={},
            action=EvaluatedAction.NO_ACTION,
            propensity=0.0,  # Zero support
            reward_paise=0,
            is_recovered=False,
        )
    ]
    target_probs = [{EvaluatedAction.NO_ACTION: 1.0}]

    diag = PropensityOverlapDiagnostic.evaluate_overlap(episodes, target_probs)
    assert not diag["is_fully_supported"]
    assert "deterministic strata" in str(diag["warning"])
