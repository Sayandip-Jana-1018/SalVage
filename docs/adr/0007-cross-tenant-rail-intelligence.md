# ADR-0007: Cross-Tenant Rail Intelligence

**Status:** Accepted
**Date:** 2026-08-29
**Decision:** Rail health is computed across the entire tenant population, with hard isolation guarantees. No merchant learns anything about another merchant's volume, customers, conversion, or business.

## Context

A single merchant does not generate enough traffic to detect an issuer degradation quickly. A payment gateway sees every merchant at once — an outage that takes one merchant forty minutes to notice is visible in pooled traffic in a few minutes.

This is the most impactful detection improvement available and it shapes how the sense layer (Phase 3) is built.

## Decision

### Pooled Detection

- Rail health aggregation pools observations from all merchants into a shared health signal per rail (issuer × payment method × provider).
- The derived health verdict (healthy / degraded / down, with detection timestamp and estimated blast radius) crosses the tenant boundary.
- The underlying per-merchant contribution never crosses the tenant boundary.

### Privacy Guarantees

1. **Minimum cohort size:** No cross-tenant signal is published for a rail unless at least N merchants contributed observations in the aggregation window. N is configurable; the default will be determined by analysis in Phase 3 and documented.
2. **Per-merchant contribution cap:** Each merchant's contribution to the aggregate is capped (e.g., at 1/N of the total or a fixed maximum) so that a single large merchant cannot dominate or be inferred from the signal.
3. **Signal-only output:** Published health signals contain only: rail identifier, health status, confidence, detection timestamp, estimated recovery time. Never: merchant-specific volumes, transaction counts, amounts, or customer identifiers.

### Threat Model

A malicious merchant could attempt to infer information about other merchants by:
1. **Controlling their own traffic** while observing the published health signal — e.g., stopping their own transactions on a rail and seeing if the aggregate changes.
2. **Probing at low-traffic times** when fewer merchants are active, hoping to increase their fraction of the aggregate.

Mitigations:
- The minimum cohort size prevents (2): if too few merchants are active, no signal is published.
- The per-merchant contribution cap prevents (1): a single merchant's traffic removal changes the aggregate by at most 1/N.
- A test (`CrossTenantInferenceTest`) attempts this attack and asserts the signal leakage is below a threshold.

### Measurable Claim

Detection latency for injected outages under pooled detection versus per-merchant detection, reported with confidence intervals in `EVALUATION.md`. If pooling does not measurably help, that result is reported honestly.

## Consequences

- The sense layer (Phase 3) must be designed for pooled aggregation from the start.
- Health signals are a derived data product with their own versioning and privacy guarantees.
- The cross-tenant inference test is a novel testing approach that should be documented.
