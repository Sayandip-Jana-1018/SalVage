"""The acceptance check: a hundred thousand events in a workable time.

Marked ``slow`` and excluded from the default run, because a test that takes a
minute is a test people stop running. CI runs it explicitly.

There is no assertion here about a particular number of seconds. A timing
threshold tuned on one machine fails on a slower CI runner for reasons that
have nothing to do with the code, and the usual response -- loosening the
threshold until it passes -- leaves a test that asserts nothing. What is
asserted is that the run completes, produces the volume it claims, and that
throughput is high enough that generating a working dataset is not an
overnight job. The actual measured figure belongs in the phase report, taken
from a run rather than from a docstring.
"""

from __future__ import annotations

import json
import pathlib

import pytest

from salvage_sim.simulator import RunConfig, Simulation

TARGET_EVENTS = 100_000
# Deliberately far below anything observed. This exists to catch a change that
# makes generation an order of magnitude slower, not to police normal variance
# between machines.
MINIMUM_EVENTS_PER_SECOND = 200.0


@pytest.mark.slow
def test_generates_a_hundred_thousand_events(tmp_path: pathlib.Path) -> None:
    simulation = Simulation(RunConfig(seed=2026, days=30.0, merchants=12))
    summary = simulation.write(tmp_path)

    assert summary.failures >= TARGET_EVENTS, (
        f"the run produced {summary.failures} events, short of {TARGET_EVENTS}. "
        "Raise days or merchants; this test exists to measure the target volume."
    )

    lines = sum(1 for _ in (tmp_path / "events.jsonl").open(encoding="utf-8"))
    assert lines == summary.failures, "the summary disagrees with the file it wrote"

    labels = sum(1 for _ in (tmp_path / "labels.jsonl").open(encoding="utf-8"))
    assert labels == summary.failures, "every event must have exactly one label"

    throughput = summary.failures / summary.wall_seconds
    assert throughput > MINIMUM_EVENTS_PER_SECOND, (
        f"{throughput:.0f} events/sec is far below anything previously observed; "
        "something has become much more expensive per event"
    )

    # Printed rather than asserted. The number goes in the phase report, and it
    # comes from here rather than from anyone's recollection.
    print(
        f"\ngenerated {summary.failures} events and "
        f"{summary.counterfactuals} counterfactuals in "
        f"{summary.wall_seconds:.1f}s ({throughput:.0f} events/sec)"
    )


@pytest.mark.slow
def test_the_large_run_is_internally_consistent(tmp_path: pathlib.Path) -> None:
    """Checks that only become meaningful at volume.

    Uniqueness of attempt ids across a hundred thousand events says something
    that the same check over two hundred does not.
    """
    simulation = Simulation(RunConfig(seed=2027, days=30.0, merchants=12))
    simulation.write(tmp_path)

    attempt_ids: set[str] = set()
    event_ids: set[str] = set()
    with (tmp_path / "events.jsonl").open(encoding="utf-8") as handle:
        for line in handle:
            event = json.loads(line)
            attempt_ids.add(event["payment_attempt_id"])
            event_ids.add(event["event_id"])

    with (tmp_path / "events.jsonl").open(encoding="utf-8") as handle:
        total = sum(1 for _ in handle)

    assert len(attempt_ids) == total, "payment_attempt_id is not unique per event"
    assert len(event_ids) == total, "event_id is not unique per event"

    label_ids: set[str] = set()
    with (tmp_path / "labels.jsonl").open(encoding="utf-8") as handle:
        for line in handle:
            label_ids.add(json.loads(line)["payment_attempt_id"])
    assert label_ids == attempt_ids, "labels and events do not cover the same attempts"
