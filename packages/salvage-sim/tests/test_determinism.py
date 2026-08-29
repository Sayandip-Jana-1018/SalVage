"""The same seed reproduces the same dataset, byte for byte.

Principle 2 of the project is that every decision replays bit-identically.
That has to start here: a policy cannot be replayed against a dataset that
regenerates differently each time, and an evaluation run in March cannot be
compared with one run in June unless the data underneath them is the same.

Byte equality of the whole file, not a spot check of a few fields. A weaker
assertion would pass while an unstable dict ordering or a float formatting
difference quietly made two "identical" datasets non-identical to anything
that hashed them.
"""

from __future__ import annotations

import hashlib
import json
import pathlib

from salvage_sim.rng import KeyedRandom
from salvage_sim.simulator import RunConfig, Simulation

CONFIG = RunConfig(seed=555, days=2.0, merchants=1)


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_into(directory: pathlib.Path, config: RunConfig) -> dict[str, str]:
    Simulation(config).write(directory)
    return {name: digest(directory / name) for name in ("events.jsonl", "labels.jsonl")}


def test_the_same_seed_produces_identical_files(tmp_path: pathlib.Path) -> None:
    first = run_into(tmp_path / "first", CONFIG)
    second = run_into(tmp_path / "second", CONFIG)
    assert first == second, (
        "two runs with the same seed produced different files. Something in the "
        "generation path depends on iteration order, wall-clock time, or a "
        "sequential PRNG whose position varies."
    )


def test_a_different_seed_produces_different_files(tmp_path: pathlib.Path) -> None:
    """Otherwise the seed would be ignored and every run identical."""
    first = run_into(tmp_path / "a", CONFIG)
    second = run_into(tmp_path / "b", RunConfig(seed=556, days=2.0, merchants=1))
    assert first != second


def test_the_manifest_records_what_produced_the_run(tmp_path: pathlib.Path) -> None:
    simulation = Simulation(CONFIG)
    summary = simulation.write(tmp_path)
    manifest = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))

    assert manifest["seed"] == CONFIG.seed
    assert manifest["calibration_sha256"] == simulation.calibration.source_digest
    assert len(manifest["calibration_sha256"]) == 64
    assert manifest["summary"]["failures"] == summary.failures
    assert summary.failures > 0


def test_event_ids_are_stable_across_runs_and_unique_within_one(
    tmp_path: pathlib.Path,
) -> None:
    """salvage-core deduplicates on ``event_id``.

    A collision would look, from the service's side, like a duplicate delivery
    of the same event, and the second one would be silently dropped. That would
    remove rows from the dataset in a way nothing downstream could detect.
    """
    Simulation(CONFIG).write(tmp_path)
    ids = [
        json.loads(line)["event_id"]
        for line in (tmp_path / "events.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    assert len(ids) == len(set(ids)), f"{len(ids) - len(set(ids))} duplicate event ids"


def test_keyed_draws_do_not_depend_on_the_order_they_are_made(seed: int = 12345) -> None:
    """The property the whole RNG design exists for.

    Drawing a key after a thousand unrelated draws must give the same value as
    drawing it first. Without this, adding a draw anywhere would change every
    label everywhere, and the invariance test could not pass for the right
    reason.
    """
    rng = KeyedRandom(seed)
    direct = rng.uniform("stream.a", "key", 7)

    for index in range(1000):
        rng.uniform("stream.b", index)
    after = rng.uniform("stream.a", "key", 7)

    assert direct == after


def test_different_streams_with_the_same_key_are_independent() -> None:
    rng = KeyedRandom(1)
    values = {rng.uniform(f"stream.{i}", "same-key") for i in range(200)}
    assert len(values) == 200, "keyed draws are colliding across stream names"


def test_the_key_separator_prevents_ambiguity() -> None:
    """``("ab", "c")`` and ``("a", "bc")`` must not be the same key.

    Without a separator they would concatenate identically, silently
    correlating the outcomes of two unrelated attempts.
    """
    rng = KeyedRandom(1)
    assert rng.uniform("s", "ab", "c") != rng.uniform("s", "a", "bc")
