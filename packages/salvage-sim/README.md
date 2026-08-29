# salvage-sim

**Not built yet. This is a Phase 1 deliverable.**

A standalone, installable package that generates realistic Indian payment
failure streams. It is a deliverable in its own right, not a test fixture.

## What it will model

- Issuer outages as a **bursty, correlated** process, not independent coin
  flips: outages cluster in time, and an outage on one method for an issuer
  raises the probability of trouble on another.
- Method-specific failure characteristics across UPI, cards, netbanking, and
  wallets.
- Salary-cycle effects — insufficient-funds declines are not uniform across
  the month.
- Festival and sale-event traffic spikes.
- Recurring mandate lifecycle: expiry, balance failures, revocation.
- Customer behaviour: opt-out, abandonment, repeat purchase.

## Ground truth

For each failure the simulator emits the counterfactual: whether a retry would
have succeeded, and whether it would have succeeded on an alternative rail, at
several future time offsets. This is the label the Phase 5 evaluation harness
needs.

**The label-generating process must not read any feature the models use.**
Stated precisely, because the literal phrasing "causally independent of the
features" is impossible — if it held, the features would carry no information
and no model could learn anything:

- Labels are generated from a **latent** ground-truth process (issuer state,
  customer balance state, mandate state).
- Features are **noisy, delayed, partial observations** of that same latent
  process.
- Dependence flows latent → {features, labels}. Never features → labels.

Two tests will enforce this: an architecture test asserting the label
generator has no import or read path to feature computation, and an invariance
test asserting that perturbing feature-only nuisance parameters (observation
noise, aggregation window) leaves the label distribution unchanged.

## Calibration

Every calibration parameter lives in `calibration.yaml` and nowhere else, per
[ADR-0006](../../docs/adr/0006-numbers-policy.md). Each carries its unit and a
note naming where a real-world value would come from. The file header states
these are illustrative defaults pending calibration against production data.

## Attribution window

Phase 1 also pins the definition of "recovered": success on the same order
within an attribution window, attributed to the most recent Salvage action,
with the simulator's would-have-recovered-anyway counterfactual subtracted.
The headline metric is **incremental** rupees, never gross.
