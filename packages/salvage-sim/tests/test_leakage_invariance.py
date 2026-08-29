"""Perturbing feature-only nuisance must not move a single label.

This is the behavioural half of the no-leakage guarantee, and it catches what
the import graph cannot. A label module could receive an observation-derived
value through a shared object, a cached attribute, or a parameter passed down
from the driver, without importing anything new. The import test would pass.
This one would not.

The experiment is simple. Take the calibration, change every value in the
``observation`` block -- delay, error-code corruption, missing-field rates --
and regenerate with the same seed. Then:

- the **labels** must be byte-identical, because none of those values is a
  fact about the world, and
- the **events** must differ, because all of them are facts about the report.

The second half is not decoration. Without it the test would pass trivially if
the perturbation had no effect at all: a typo in the YAML key, a block the
loader silently ignored, a run so small nothing was corrupted. Asserting that
the perturbation *did* something is what makes the first assertion mean
anything.

Why this is possible at all is :mod:`salvage_sim.rng`: draws are keyed by
content rather than drawn from a stream, so an extra draw in the observation
layer cannot shift a draw in the label layer. With a conventional sequential
PRNG this test would fail for reasons that have nothing to do with leakage,
and the only remedy would be hand-maintained stream separation.
"""

from __future__ import annotations

import copy
import dataclasses
import json
import pathlib
from typing import Any

import pytest
import yaml

from salvage_sim.calibration import Calibration, find_calibration_file, load_calibration
from salvage_sim.simulator import RunConfig, Simulation

SEED = 4242
DAYS = 2.0
MERCHANTS = 1

# Every knob in the observation block, moved far enough that its effect cannot
# be mistaken for noise. The delay is lengthened rather than shortened so that
# it is visible in the timestamps at any run length.
PERTURBATION: dict[str, float] = {
    "event_delay_seconds_mean": 45.0,
    "generic_error_code_rate": 0.75,
    "issuer_unknown_rate": 0.60,
    "instrument_detail_missing_rate": 0.80,
}


def _write_variant(
    tmp_path: pathlib.Path, source: pathlib.Path, observation: dict[str, float]
) -> pathlib.Path:
    raw: dict[str, Any] = yaml.safe_load(source.read_bytes())
    variant = copy.deepcopy(raw)
    variant["observation"] = observation
    destination = tmp_path / "calibration-variant.yaml"
    destination.write_text(yaml.safe_dump(variant, sort_keys=True), encoding="utf-8")
    return destination


def _run(calibration: Calibration) -> tuple[list[str], list[str]]:
    """Serialise a run's events and labels exactly as ``write`` would."""
    simulation = Simulation(
        RunConfig(seed=SEED, days=DAYS, merchants=MERCHANTS), calibration=calibration
    )
    events: list[str] = []
    labels: list[str] = []
    for event, label, _, _ in simulation.stream():
        events.append(json.dumps(event, sort_keys=True))
        labels.append(json.dumps(dataclasses.asdict(label), sort_keys=True, default=str))
    return events, labels


@pytest.fixture(scope="module")
def baseline() -> tuple[list[str], list[str]]:
    return _run(load_calibration())


@pytest.fixture(scope="module")
def perturbed(tmp_path_factory: pytest.TempPathFactory) -> tuple[list[str], list[str]]:
    tmp_path = tmp_path_factory.mktemp("perturbed")
    variant = _write_variant(tmp_path, find_calibration_file(), PERTURBATION)
    return _run(load_calibration(variant))


def test_the_run_is_large_enough_to_be_meaningful(
    baseline: tuple[list[str], list[str]],
) -> None:
    events, labels = baseline
    assert len(events) == len(labels)
    assert len(events) >= 100, (
        f"only {len(events)} failures generated; the invariance assertions below "
        "would be weak. Increase DAYS or MERCHANTS."
    )


def test_perturbing_observation_leaves_labels_bit_identical(
    baseline: tuple[list[str], list[str]], perturbed: tuple[list[str], list[str]]
) -> None:
    _, baseline_labels = baseline
    _, perturbed_labels = perturbed

    assert len(baseline_labels) == len(perturbed_labels), (
        "the number of labels changed when only observation parameters were "
        "perturbed. Something in the label path is reading the observation "
        "block, or the observation layer is consuming randomness the world "
        "depends on."
    )

    differing = [
        index
        for index, (before, after) in enumerate(
            zip(baseline_labels, perturbed_labels, strict=True)
        )
        if before != after
    ]
    assert not differing, (
        f"{len(differing)} of {len(baseline_labels)} labels changed when only "
        f"feature-only nuisance parameters were perturbed. First divergence at "
        f"index {differing[0]}:\n"
        f"  baseline:  {baseline_labels[differing[0]]}\n"
        f"  perturbed: {perturbed_labels[differing[0]]}\n"
        "Labels must be a function of latent state alone."
    )


def test_the_perturbation_actually_changed_the_events(
    baseline: tuple[list[str], list[str]], perturbed: tuple[list[str], list[str]]
) -> None:
    """Without this, the test above could pass by doing nothing at all."""
    baseline_events, _ = baseline
    perturbed_events, _ = perturbed
    differing = sum(
        1
        for before, after in zip(baseline_events, perturbed_events, strict=True)
        if before != after
    )
    assert differing > len(baseline_events) * 0.5, (
        f"only {differing} of {len(baseline_events)} events changed under a "
        "perturbation that raised every corruption rate to at least 0.6. The "
        "observation block is probably not being applied, which would make the "
        "invariance assertion vacuous."
    )


@pytest.mark.parametrize("field_name", sorted(PERTURBATION))
def test_each_nuisance_parameter_individually_preserves_labels(
    tmp_path: pathlib.Path,
    baseline: tuple[list[str], list[str]],
    field_name: str,
) -> None:
    """One parameter at a time, so a failure names the culprit.

    The combined test says leakage exists; this says which knob leaked, which
    is the difference between a five-minute fix and an afternoon of bisecting.
    """
    source = find_calibration_file()
    observation: dict[str, float] = yaml.safe_load(source.read_bytes())["observation"]
    single = {**observation, field_name: PERTURBATION[field_name]}

    variant = _write_variant(tmp_path, source, single)
    _, labels = _run(load_calibration(variant))
    _, baseline_labels = baseline

    assert labels == baseline_labels, (
        f"perturbing observation.{field_name} changed the labels. That parameter "
        "describes how the failure is reported, not what happened, so no label "
        "may depend on it."
    )
