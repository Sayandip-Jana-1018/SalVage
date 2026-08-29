"""The run driver.

The only module that imports both :mod:`salvage_sim.generate` and
:mod:`salvage_sim.labels`. It sits above them precisely so that neither has to
know the other exists, which is what keeps the label side free of any import
path to the feature side.

A run produces three files:

``events.jsonl``    the ``payment_failed.v1`` stream, exactly as salvage-core
                    would receive it: delayed, sometimes generic, sometimes
                    missing the issuer.
``labels.jsonl``    one record per event, keyed by ``payment_attempt_id``,
                    carrying the true cause and every counterfactual.
``manifest.json``   what produced the run, and what came out.

They are separate files, and separate on purpose. A dataset where the truth
sits in the same record as the observation is one careless ``read_json`` away
from training on the answer. Keeping them apart means joining them is a
deliberate act.
"""

from __future__ import annotations

import dataclasses
import json
import pathlib
import time
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from salvage_sim.calibration import Calibration, load_calibration
from salvage_sim.clock import SimClock
from salvage_sim.generate.events import EventEmitter
from salvage_sim.labels.counterfactual import CounterfactualLabeller, FailureLabel
from salvage_sim.latent.journey import Attempt, JourneySimulator, OrderJourney
from salvage_sim.latent.traffic import TrafficGenerator
from salvage_sim.latent.world import World
from salvage_sim.rng import KeyedRandom


@dataclass(frozen=True, slots=True)
class RunConfig:
    seed: int
    days: float
    merchants: int
    start: datetime | None = None
    """Overrides ``simulation.default_start``. Mostly useful for landing a
    short run on a festival window, or deliberately off one."""


@dataclass
class RunSummary:
    """Counts from a completed run.

    Every number here is produced by counting what the run actually emitted.
    None is estimated, and none is adjusted. If a distribution comes out
    lopsided, this reports the lopsided distribution -- that is the point of
    having it.
    """

    orders: int = 0
    attempts: int = 0
    failures: int = 0
    successes: int = 0
    orders_recovered_naturally: int = 0
    failures_recovered_naturally_in_window: int = 0
    failures_with_oracle_recovery: int = 0
    permanent_failures: int = 0
    recurring_failures: int = 0
    labels: int = 0
    counterfactuals: int = 0
    failure_causes: Counter[str] = field(default_factory=Counter)
    failures_by_method: Counter[str] = field(default_factory=Counter)
    failures_by_issuer: Counter[str] = field(default_factory=Counter)
    oracle_actions: Counter[str] = field(default_factory=Counter)
    wall_seconds: float = 0.0

    def as_dict(self) -> dict[str, Any]:
        """JSON-ready counts.

        Built field by field rather than with ``dataclasses.asdict``, which is
        actively wrong for ``Counter``: it rebuilds every dict field as
        ``type(obj)(pairs)``, and ``Counter(pairs)`` counts the pairs as
        elements rather than treating them as items. A ``Counter`` of causes
        comes back out as ``{("insufficient_funds", 812): 1}``. Nothing warns;
        the manifest simply fails to serialise, and had the keys been
        JSON-legal it would have written nonsense instead.
        """
        payload: dict[str, Any] = {}
        for field_info in dataclasses.fields(self):
            value = getattr(self, field_info.name)
            payload[field_info.name] = (
                dict(sorted(value.items())) if isinstance(value, Counter) else value
            )
        return payload


class Simulation:
    """One configured run. Construct, then :meth:`stream` or :meth:`write`."""

    def __init__(self, config: RunConfig, calibration: Calibration | None = None) -> None:
        self.config = config
        self.calibration = calibration or load_calibration()
        start = config.start or self.calibration.simulation.default_start
        self.clock = SimClock.create(start, self.calibration.simulation.timezone)
        self.rng = KeyedRandom(config.seed)

        self.world = World(
            calibration=self.calibration,
            clock=self.clock,
            rng=self.rng,
            horizon_days=config.days,
            merchant_count=config.merchants,
        )
        self.traffic = TrafficGenerator(self.world)
        self.journey_simulator = JourneySimulator(self.world)
        self.labeller = CounterfactualLabeller(self.world)
        self.emitter = EventEmitter(self.calibration, self.clock, self.rng)

    def journeys(self) -> Iterator[OrderJourney]:
        """Every order in the run, simulated forward, in time order.

        Streamed rather than collected: a run is bounded by the order list,
        and materialising the journeys as well would roughly triple peak
        memory for no benefit, since nothing needs to look backwards.
        """
        for order in self.traffic.orders():
            yield self.journey_simulator.run(order)

    def stream(self) -> Iterator[tuple[dict[str, Any], FailureLabel, OrderJourney, Attempt]]:
        """Yield ``(event, label, journey, attempt)`` for every failure.

        Note that orders which never failed do not appear here at all -- there
        is no event to emit for a payment that worked. Anything counting
        orders or successes has to iterate :meth:`journeys` instead, which is
        why :meth:`write` does.
        """
        for journey in self.journeys():
            yield from self._failures_of(journey)

    def _failures_of(
        self, journey: OrderJourney
    ) -> Iterator[tuple[dict[str, Any], FailureLabel, OrderJourney, Attempt]]:
        for failure in journey.failures:
            yield (
                self.emitter.emit(failure),
                self.labeller.label(journey, failure),
                journey,
                failure,
            )

    def write(self, output_dir: pathlib.Path) -> RunSummary:
        output_dir.mkdir(parents=True, exist_ok=True)
        summary = RunSummary()
        started = time.perf_counter()

        events_path = output_dir / "events.jsonl"
        labels_path = output_dir / "labels.jsonl"

        with (
            events_path.open("w", encoding="utf-8", newline="\n") as events_file,
            labels_path.open("w", encoding="utf-8", newline="\n") as labels_file,
        ):
            for journey in self.journeys():
                summary.orders += 1
                summary.attempts += len(journey.attempts)
                if journey.succeeded:
                    summary.successes += 1
                    summary.orders_recovered_naturally += 1

                for event, label, _, failure in self._failures_of(journey):
                    # sort_keys so two runs of the same seed produce
                    # byte-identical files. Without it, dict ordering is stable
                    # in practice but guaranteed by nothing, and "bit-identical
                    # replay" would rest on an implementation detail.
                    events_file.write(json.dumps(event, sort_keys=True) + "\n")
                    labels_file.write(
                        json.dumps(dataclasses.asdict(label), sort_keys=True, default=str)
                        + "\n"
                    )
                    self._count(summary, label, failure)

        summary.wall_seconds = time.perf_counter() - started
        self._write_manifest(output_dir, summary)
        return summary

    @staticmethod
    def _count(summary: RunSummary, label: FailureLabel, failure: Attempt) -> None:
        summary.failures += 1
        summary.labels += 1
        summary.counterfactuals += len(label.counterfactuals)
        summary.failure_causes[label.failure_cause] += 1
        summary.failures_by_method[failure.rail.method] += 1
        summary.failures_by_issuer[failure.rail.issuer_id] += 1
        summary.oracle_actions[label.oracle.action.value] += 1
        if label.is_permanent:
            summary.permanent_failures += 1
        if failure.is_recurring:
            summary.recurring_failures += 1
        if label.recovered_naturally_in_window:
            summary.failures_recovered_naturally_in_window += 1
        if label.oracle.recovers:
            summary.failures_with_oracle_recovery += 1

    def _write_manifest(self, output_dir: pathlib.Path, summary: RunSummary) -> None:
        """Record everything needed to reproduce the run.

        The calibration digest is over the raw bytes of the file that was
        loaded. A result can therefore be traced back to the exact parameters
        that produced it even after someone has edited the file, which is the
        difference between a reproducible dataset and one that merely claims
        to be.
        """
        manifest = {
            "generated_at": datetime.now(UTC).isoformat(),
            "seed": self.config.seed,
            "days": self.config.days,
            "merchants": self.config.merchants,
            "start": self.clock.start.isoformat(),
            "timezone": str(self.clock.timezone),
            "calibration_path": str(self.calibration.source_path),
            "calibration_sha256": self.calibration.source_digest,
            "attribution_window_hours": self.calibration.attribution.window_hours,
            "counterfactual_offsets_minutes": list(
                self.calibration.counterfactual.offsets_minutes
            ),
            "summary": summary.as_dict(),
        }
        (output_dir / "manifest.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
