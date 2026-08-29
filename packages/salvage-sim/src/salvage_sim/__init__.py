"""salvage-sim: payment failure streams with ground-truth counterfactuals.

The package is arranged around one property, and the layout is the enforcement
mechanism rather than a filing convention:

``salvage_sim.latent``     the world as it is. Issuer health, balances,
                           mandates, arrivals, and the journeys orders take
                           when nobody intervenes.
``salvage_sim.generate``   the world as it is reported. Delayed, sometimes
                           generic, sometimes missing fields.
``salvage_sim.labels``     ground truth about what other actions would have
                           produced. Reads ``latent`` and nothing else.

Dependence flows ``latent -> {generate, labels}``. There is no path from
``generate`` to ``labels``, which is what makes the labels usable as targets:
they cannot have been contaminated by the features, because they cannot see
them. ``tests/test_leakage_architecture.py`` checks that against the import
graph on every run, and ``tests/test_leakage_invariance.py`` checks the
behavioural consequence.
"""

from salvage_sim.calibration import Calibration, load_calibration
from salvage_sim.clock import SimClock
from salvage_sim.rng import KeyedRandom
from salvage_sim.simulator import RunConfig, RunSummary, Simulation

__all__ = [
    "Calibration",
    "KeyedRandom",
    "RunConfig",
    "RunSummary",
    "SimClock",
    "Simulation",
    "load_calibration",
]
