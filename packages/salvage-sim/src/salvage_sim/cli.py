"""Command line entry point.

    salvage-sim generate --seed 42 --days 30 --merchants 12 --out data/run-42
    salvage-sim describe

``generate`` writes the dataset. ``describe`` prints the loaded calibration's
digest and the invariants that were checked, which is the fastest way to find
out whether an edit to ``calibration.yaml`` is valid without running anything.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from datetime import datetime

from salvage_sim.calibration import find_calibration_file, load_calibration
from salvage_sim.simulator import RunConfig, Simulation


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="salvage-sim",
        description="Generate payment failure streams with ground-truth counterfactuals.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate = subparsers.add_parser("generate", help="write a dataset")
    generate.add_argument(
        "--seed",
        type=int,
        required=True,
        help="run seed. The same seed and calibration reproduce the run byte for byte.",
    )
    generate.add_argument("--days", type=float, default=30.0, help="simulated days (default 30)")
    generate.add_argument("--merchants", type=int, default=12, help="merchant count (default 12)")
    generate.add_argument(
        "--start",
        type=datetime.fromisoformat,
        default=None,
        help="ISO-8601 start instant, overriding simulation.default_start",
    )
    generate.add_argument(
        "--calibration",
        type=pathlib.Path,
        default=None,
        help="alternative calibration.yaml",
    )
    generate.add_argument("--out", type=pathlib.Path, required=True, help="output directory")

    describe = subparsers.add_parser("describe", help="validate and summarise the calibration")
    describe.add_argument("--calibration", type=pathlib.Path, default=None)

    return parser


def _generate(args: argparse.Namespace) -> int:
    calibration = load_calibration(args.calibration)
    simulation = Simulation(
        RunConfig(seed=args.seed, days=args.days, merchants=args.merchants, start=args.start),
        calibration=calibration,
    )
    summary = simulation.write(args.out)

    # Written to stderr so that stdout stays clean for the JSON summary, which
    # makes the command composable: `salvage-sim generate ... | jq .failures`.
    print(f"wrote {args.out}", file=sys.stderr)
    print(json.dumps(summary.as_dict(), indent=2, sort_keys=True))
    return 0


def _describe(args: argparse.Namespace) -> int:
    path = args.calibration or find_calibration_file()
    calibration = load_calibration(path)
    print(
        json.dumps(
            {
                "path": str(calibration.source_path),
                "sha256": calibration.source_digest,
                "schema_version": calibration.schema_version,
                "issuers": [issuer.id for issuer in calibration.issuers],
                "rails": [f"{i}|{m}" for i, m in calibration.rails()],
                "attribution_window_hours": calibration.attribution.window_hours,
                "counterfactual_offsets_minutes": list(calibration.counterfactual.offsets_minutes),
                "valid": True,
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.command == "generate":
        return _generate(args)
    return _describe(args)


if __name__ == "__main__":
    raise SystemExit(main())
