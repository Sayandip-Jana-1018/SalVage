# ADR-0001: Two-Language Split

**Status:** Accepted
**Date:** 2026-08-29
**Decision:** Java 21 for the transactional money service (salvage-core), Python 3.12 for the decision service (salvage-brain).

## Context

Salvage has two fundamentally different runtime concerns:

1. **Money movement** — transaction management, idempotency enforcement, saga coordination, audit ledger integrity, and multi-tenant isolation. These require strong typing, mature JDBC transaction support, and the operational maturity of the JVM (GC tuning, thread dumps, decades of production tooling).

2. **Machine learning and statistical decision-making** — change-point detection, gradient-boosted trees, calibrated probability estimation, contextual bandits, off-policy evaluation. The entire ML ecosystem (scikit-learn, LightGBM, ruptures, NumPy, Pandas, Polars) is Python-native. Wrapping these in a JVM language through JNI or subprocess calls adds fragility without benefit.

## Decision

- `salvage-core` is Java 21 / Spring Boot 3.5.x. It owns the money path, the ledger, idempotency, the bounds gate, and the saga coordinator.
- `salvage-brain` is Python 3.12 / FastAPI. It owns rail health monitoring, root cause attribution, feature computation, model inference, and policy selection.
- The boundary is a typed HTTP contract (OpenAPI 3.1 in `contracts/openapi/`). Brain is called as a pure function: given features and model/policy versions, return a ranked action list with scores and propensities. It never mutates state that affects money.
- Shared event schemas live in `contracts/events/` as JSON Schema, and conformance to them is enforced mechanically in both languages — by runtime validation and a structural drift test on the Java side, and by a served-API drift gate on the Python side. See ADR-0002.

## Consequences

- Two build toolchains, two dependency trees, two container images. CI complexity is real but bounded.
- The HTTP boundary costs a network round trip and a serialisation pass per decision. This is spent once per failure event, not per request, and the returned decision is persisted rather than recomputed. **No latency figure is quoted here because none has been measured.** The p99 decision budget is set and measured in Phase 4, against the sub-100ms requirement; if the boundary turns out to consume an unacceptable share of it, the mitigation is co-locating the services and reusing connections, not merging the languages. See `docs/OPEN_NUMBERS.md`.
- A language boundary at the money/ML seam is also a trust boundary: salvage-brain can never accidentally import a JPA repository and write to the ledger. This is the property that makes "no LLM makes a money decision" checkable by inspection rather than by discipline.

## Alternatives Considered

- **All Java (Tribuo, DJL):** The Java ML ecosystem is thin. Calibrated probability, off-policy evaluation, and property-based testing with Hypothesis have no equivalents.
- **All Python:** Django/FastAPI can do transactions, but Python's GIL, lack of real threading, and weaker type system make it the wrong tool for a system whose primary invariant is "never charge twice."
- **Kotlin multiplatform:** Interesting but the ML library story is the same as Java.
