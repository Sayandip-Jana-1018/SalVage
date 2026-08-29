# ADR-0002: Contracts as Single Source of Truth

**Status:** Accepted
**Date:** 2026-08-29
**Decision:** All wire formats (event schemas, API definitions) are defined once in `contracts/` and code-generated into both Java and Python. Drift is a CI failure.

## Context

With two services in two languages sharing event schemas and API contracts, divergence is inevitable unless there is a mechanical guarantee. A comment in a README saying "keep these in sync" is not a guarantee — it is a wish.

## Decision

- **Event schemas** live in `contracts/events/` as JSON Schema (draft 2020-12). Java types are generated at Gradle build time. Python models are generated via `datamodel-code-generator`.
- **API definitions** live in `contracts/openapi/` as OpenAPI 3.1. The brain's FastAPI app validates against this spec.
- **CI drift gate:** A CI job regenerates all types from the schemas and fails if the output differs from what is checked in. This runs on every push.
- The contracts directory is the authority. If a schema change is needed, it starts there.

## Consequences

- Schema changes are visible as diffs in `contracts/`, not buried in language-specific model classes.
- Adding a field to an event requires touching exactly one file (the schema) plus regenerating.
- Code generation adds a build step, but removes an entire class of bug (serialisation mismatch between services).

## Alternatives Considered

- **Protobuf / Avro:** Both are excellent schema-first tools. JSON Schema was chosen because: (a) the events are JSON on the wire (Kafka value serialiser), (b) JSON Schema is natively understood by OpenAPI 3.1, and (c) no additional tooling (protoc, Avro compiler) is needed. If binary serialisation becomes a performance requirement, this can be revisited.
- **No code generation:** Manual model classes in each language, with contract tests. This works for two services but scales poorly and has no mechanical guarantee of completeness.
