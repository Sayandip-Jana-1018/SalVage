"""Salvage Off-Policy Evaluation Harness Package."""

from salvage_eval.benchmark.reporter import EvaluationReporter
from salvage_eval.benchmark.runner import BenchmarkRunner
from salvage_eval.estimators.direct_method import DirectMethodEstimator
from salvage_eval.estimators.doubly_robust import DoublyRobustEstimator
from salvage_eval.estimators.ips import IPSEstimator
from salvage_eval.estimators.snips import SNIPSEstimator
from salvage_eval.types import (
    CalibrationMetrics,
    EstimatorResult,
    EvaluatedAction,
    LoggedEpisode,
    PolicyEvaluationSummary,
    RegretDecomposition,
)

__version__ = "0.1.0"

__all__ = [
    "BenchmarkRunner",
    "CalibrationMetrics",
    "DirectMethodEstimator",
    "DoublyRobustEstimator",
    "EstimatorResult",
    "EvaluatedAction",
    "EvaluationReporter",
    "IPSEstimator",
    "LoggedEpisode",
    "PolicyEvaluationSummary",
    "RegretDecomposition",
    "SNIPSEstimator",
]
