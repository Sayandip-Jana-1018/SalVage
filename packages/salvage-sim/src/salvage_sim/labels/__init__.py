"""Ground-truth labels, derived from latent state and nothing else.

This package may import from :mod:`salvage_sim.latent`,
:mod:`salvage_sim.calibration`, :mod:`salvage_sim.clock` and
:mod:`salvage_sim.rng`. It may not import from :mod:`salvage_sim.generate`,
directly or transitively. ``tests/test_leakage_architecture.py`` enforces that
against the import graph, not against this docstring.
"""

from salvage_sim.labels.counterfactual import (
    ActionKind,
    Counterfactual,
    CounterfactualLabeller,
    FailureLabel,
    OracleAction,
)

__all__ = [
    "ActionKind",
    "Counterfactual",
    "CounterfactualLabeller",
    "FailureLabel",
    "OracleAction",
]
