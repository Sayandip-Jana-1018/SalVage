"""Latent ground truth: the world as it is, independent of any observation.

Nothing in this package may import from :mod:`salvage_sim.generate`. That is
not a style preference, it is the property the counterfactual labels rest on,
and ``tests/test_leakage_architecture.py`` enforces it against the import
graph. See :mod:`salvage_sim.latent.world` for the reasoning.
"""

from salvage_sim.latent.customer import Customer, CustomerPopulation
from salvage_sim.latent.health import IssuerState, RailHealth, RailState, Trajectory
from salvage_sim.latent.mandate import Mandate, MandateBook, MandateState
from salvage_sim.latent.outcome import (
    SUCCESS,
    AttemptOutcome,
    FailureCause,
    OutcomeModel,
    Rail,
)
from salvage_sim.latent.world import Merchant, World

__all__ = [
    "SUCCESS",
    "AttemptOutcome",
    "Customer",
    "CustomerPopulation",
    "FailureCause",
    "IssuerState",
    "Mandate",
    "MandateBook",
    "MandateState",
    "Merchant",
    "OutcomeModel",
    "Rail",
    "RailHealth",
    "RailState",
    "Trajectory",
    "World",
]
