"""Shared fixtures.

Runs here are deliberately small. The statistical tests that need volume build
a :class:`World` directly over a long horizon, which costs almost nothing
because the Markov chains have only a few hundred transitions in them however
long the run is -- it is the per-order work that scales, and those tests do
none of it.
"""

from __future__ import annotations

import pathlib

import pytest

from salvage_sim.calibration import Calibration, load_calibration
from salvage_sim.clock import SimClock
from salvage_sim.latent.world import World
from salvage_sim.rng import KeyedRandom
from salvage_sim.simulator import RunConfig, Simulation

REPO_MARKER = "contracts"


def repo_root() -> pathlib.Path:
    """The repository root, found by walking up for the contracts directory.

    Not ``parents[3]``. A hardcoded index is correct until the day the layout
    changes, and then it fails somewhere far from the cause -- a mistake this
    repository has already made once, in salvage-brain's config loader.
    """
    for directory in pathlib.Path(__file__).resolve().parents:
        if (directory / REPO_MARKER).is_dir():
            return directory
    raise RuntimeError(f"no ancestor of {__file__} contains a {REPO_MARKER}/ directory")


@pytest.fixture(scope="session")
def repo() -> pathlib.Path:
    """The repository root. A fixture rather than an import from this module,
    because ``tests/`` is not a package and importing across test files only
    works by accident of ``sys.path``."""
    return repo_root()


@pytest.fixture(scope="session")
def calibration() -> Calibration:
    return load_calibration()


@pytest.fixture(scope="session")
def clock(calibration: Calibration) -> SimClock:
    return SimClock.create(
        calibration.simulation.default_start, calibration.simulation.timezone
    )


@pytest.fixture(scope="session")
def world(calibration: Calibration, clock: SimClock) -> World:
    """A thirty-day world, shared across the suite.

    Session-scoped because it is read-only to every test that takes it. Its
    internal caches are memoisation of deterministic keyed draws -- ask for the
    same customer twice and you get the same object either way -- so sharing
    it cannot make one test's result depend on another's having run.
    """
    return World(
        calibration=calibration,
        clock=clock,
        rng=KeyedRandom(20260829),
        horizon_days=30.0,
        merchant_count=2,
    )


@pytest.fixture(scope="session")
def small_run() -> Simulation:
    """A whole simulation, small enough to run inside a test.

    Two days and one merchant produces a few thousand orders and a few hundred
    failures, which is enough for every structural assertion and for the
    contract conformance sweep.
    """
    return Simulation(RunConfig(seed=101, days=2.0, merchants=1))


@pytest.fixture(scope="session")
def small_run_labels(small_run: Simulation) -> list[tuple[dict[str, object], object]]:
    """``(event, label)`` pairs from the small run, materialised once."""
    return [(event, label) for event, label, _, _ in small_run.stream()]
