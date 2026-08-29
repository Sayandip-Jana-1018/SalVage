# ADR-0006: Numbers Policy

**Status:** Accepted
**Date:** 2026-08-29
**Decision:** Three kinds of numbers, three rules. No number is invented, estimated, or presented without provenance.

## Context

This work will be read by people who see real Indian payment failure statistics on their own dashboards daily. An invented figure is not a small inaccuracy to that reader — it is the end of their trust in everything else in the repository.

## Decision

### Kind 1: Simulator Calibration Parameters

Outage arrival rates, per-method failure probabilities, salary cycle amplitude, mandate expiry rates, festival load multipliers, customer opt-out rates, and everything else the simulator needs to run.

**Rule:** Use plausible, realistic default values so the system produces meaningful output from the first run. Every value lives in a single file at `packages/salvage-sim/calibration.yaml`. Each value carries a comment giving its unit and one line naming where a real-world value would come from. The file header states these are illustrative defaults pending calibration against production data.

Nothing outside `calibration.yaml` may hardcode a calibration value.

### Kind 2: Measured Results

Anything in `EVALUATION.md`, anything the console displays, anything reported as a system outcome.

**Rule:** Always the real output of code actually running. Never hand-written, never adjusted, never rounded in a favourable direction. If a result is disappointing, report the disappointing result.

### Kind 3: Claims About the External World

Any statement about Indian payment failure rates, market size, industry losses, or what any company, regulator, or study has reported.

**Rule:** Do not write these at all. Not as placeholders, not as plausible estimates, not in the README, not in code comments. Describe the mechanism without the number. Keep a running list in `docs/OPEN_NUMBERS.md` of every place where a real figure would strengthen the writing.

## Consequences

- The simulator runs out of the box with plausible defaults.
- All measured results are reproducible from code.
- No claim in the repository is unsourced.
- `docs/OPEN_NUMBERS.md` is a living document of gaps to fill with real data.
