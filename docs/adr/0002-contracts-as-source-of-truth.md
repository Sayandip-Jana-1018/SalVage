# ADR-0002: Contracts as Single Source of Truth

**Status:** Accepted
**Date:** 2026-08-29
**Decision:** All wire formats (event schemas, API definitions) are defined once in `contracts/` and code-generated into both Java and Python. Drift is a CI failure.

## Context

With two services in two languages sharing event schemas and API contracts, divergence is inevitable unless there is a mechanical guarantee. A comment in a README saying "keep these in sync" is not a guarantee — it is a wish.

## Decision

- **Event schemas** live in `contracts/events/` as JSON Schema (draft 2020-12).
- **API definitions** live in `contracts/openapi/` as OpenAPI 3.1.
- The contracts directory is the authority. A schema change starts there.

Four mechanisms enforce this. None of them depends on anybody remembering.

1. **Runtime validation at the edge (Java).** `EventContractValidator` loads the schema from the classpath and validates every inbound payload before any business logic sees it. A payload that violates the contract is rejected rather than half-processed. This also covers the case that matters most in production: a producer we do not control changing its payload without telling us.
2. **Structural drift test (Java).** `PaymentFailedEventContractTest` asserts that the set of JSON field names on the `PaymentFailedEvent` record is *exactly* the set of properties in the schema. Adding a field to the schema without adding it to the record fails the build, and so does the reverse.
3. **Schema validity gate (CI).** `scripts/check_contracts.py` asserts every event schema is a structurally valid 2020-12 document and sets `additionalProperties: false` — without which an unknown field is silently dropped instead of rejected.
4. **Served-API drift gate (CI).** The same script imports the FastAPI app, generates the OpenAPI it actually serves, and asserts it covers every path, operation, and response status the committed contract promises. This has already caught real drift: two endpoints were setting status codes imperatively, so the served spec omitted the `503` and `404` the contract advertised.

`make contracts-check` runs 3 and 4; `make test` runs 1 and 2.

### On code generation, which we deliberately did not do for Java

An earlier draft of this ADR specified generating Java types from the schema at build time. That was reversed for two reasons.

First, the mature Java generators target draft-07; support for 2020-12 is partial, and a generator that quietly ignores keywords it does not understand gives a *weaker* guarantee than validating against the schema directly, while looking stronger.

Second, a generated POJO proves the two artefacts were consistent at build time. Runtime validation proves each individual message is consistent right now. For a system ingesting events from a payment gateway it does not control, the second is the property that matters.

The hand-written record plus mechanisms 1 and 2 gives a strictly stronger guarantee than codegen would have, at the cost of one small test.

Python has no generated event models yet because `salvage-brain` does not consume events directly in Phase 0 — it reads facts that `salvage-core` has already validated and persisted. When it does consume events (Phase 3), models will be generated with `datamodel-code-generator`, which handles 2020-12 properly, and the regenerate-and-diff gate will be added to CI then. Generating models nothing imports would be ceremony, not a guarantee.

## Consequences

- Schema changes are visible as diffs in `contracts/`, not buried in language-specific model classes.
- Adding a field to an event requires touching the schema and the record; the build tells you if you forget the second.
- Validation costs a schema evaluation per message. At the volumes involved this is not measurable next to the database write it precedes.
- There is one hand-written type per event. That is acceptable at this cardinality and would not be at fifty events, at which point codegen should be revisited.

## Alternatives Considered

- **Protobuf / Avro:** Both are excellent schema-first tools with real codegen. JSON Schema was chosen because (a) the events are JSON on the wire, (b) JSON Schema is natively understood by OpenAPI 3.1, and (c) no extra toolchain (protoc, Avro compiler) is needed in two languages. If binary serialisation becomes a performance requirement, revisit.
- **Manual model classes with no enforcement:** what most two-service systems do, and what drifts within a quarter.
