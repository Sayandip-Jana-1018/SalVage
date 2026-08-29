# Phase 0: Foundation

What was built, what was verified, and what deliberately does not exist yet.

---

## 1. What Phase 0 delivered

The skeleton everything else grows inside, plus one working slice through it.

**Infrastructure.** Docker Compose bringing up PostgreSQL 16 + TimescaleDB
2.29.2, Redis 7.4.11, and Redpanda v25.3.17. Every image pinned to an exact
patch version — `latest` in a compose file means the stack changes underneath
you between runs, which makes "identical numbers on regeneration" impossible.
Topics are created declaratively by a one-shot init container from
`ops/redpanda/topics.sh`, with cluster-level auto-topic-creation switched off,
so partition counts and retention are version-controlled rather than being
whatever a producer happened to trigger first.

**Contracts.** `contracts/events/payment_failed.v1.schema.json` (JSON Schema
2020-12) and `contracts/openapi/brain.v1.yaml` (OpenAPI 3.1), with four
mechanisms enforcing that they are the single source of truth — see
[ADR-0002](adr/0002-contracts-as-source-of-truth.md).

**salvage-core** (Java 21, Spring Boot 3.5.16, Gradle 8.12 Kotlin DSL):

- Flyway baseline schema: `merchants`, `payment_attempts`, `failure_events`.
- A Kafka consumer that validates every payload against the published schema
  before any business logic sees it, then writes the attempt and failure rows
  in one transaction.
- Health endpoints that round-trip PostgreSQL, Redis, and Kafka.

**salvage-brain** (Python 3.12, FastAPI, uv):

- The same round-tripping health endpoints.
- `GET /v1/attempts/{merchant_id}/{payment_attempt_id}` — the merchant-scoped
  read path the Phase 3 feature store builds on.

**`make demo`** — an end-to-end round trip requiring only Docker and bash:
publish a `payment_failed.v1` event to Kafka, have the Java service consume,
validate, and persist it, then read it back out through the Python service and
assert the values that come out are the values that went in, including that
publishing the same event twice still produces one row.

---

## 2. Design decisions worth knowing about

### The database enforces what the comments claim

`payment_attempts` and `failure_events` are described as append-only. A comment
saying so is a wish, so `trg_payment_attempts_immutable` and
`trg_failure_events_immutable` reject `UPDATE` and `DELETE` at the database
level, and there are tests that try both.

### Cross-tenant references are impossible, not merely discouraged

`failure_events` references `payment_attempts` through a **composite** foreign
key carrying `merchant_id`. A plain key on the attempt id alone would let a
failure event in tenant A reference an attempt in tenant B and the database
would happily allow it.

### Repositories cannot be used unscoped

The repositories extend Spring Data's bare `Repository` marker, not
`JpaRepository`. `JpaRepository` would inherit `findAll()`, `findById()`, and
`deleteAll()` — none of which take a merchant id. The architecture claims
multi-tenant isolation is enforced at the repository layer; inheriting a pile
of unscoped methods would have made that claim false the moment anyone called
one.

### Health endpoints leak nothing

Both services report a failing dependency's exception **type** and never its
message. Driver and SQLAlchemy errors routinely embed the connection URL, which
embeds the password, and these endpoints are unauthenticated. Actuator's
`show-details` is set to `never` for the same reason. Both services have a test
that asserts a credential-bearing exception message does not appear in the
response body.

### The Kafka producer is idempotent

`enable.idempotence: true` with `acks=all`. Without it, a producer-side retry
after a network blip can write the same record twice, and "never originate a
duplicate" would be false at the very first hop.

### Deduplication is enforced by the database, not by the read before it

`ingest()` checks for an existing `event_id` first, but that check is a fast
path. The authority is the unique constraint on `(merchant_id, event_id)`. Two
workers racing on the same event both pass the read; one insert wins and the
loser catches a constraint violation and reports a duplicate. A check-then-act
without the constraint is a race with a very wide window.

---

## 3. Problems found and fixed during Phase 0

These are recorded because they are the kind of thing that is expensive to find
later.

**A committed `org.gradle.java.home` pointing at an absolute Windows path.**
This made the build fail on every machine that was not the one it was written
on, including CI, with `Value 'C:\Users\...' given for org.gradle.java.home
Gradle property is invalid`. Removed; the JDK now comes from the Gradle
toolchain declaration, with the foojay resolver provisioning one if the machine
has none. Editor settings carrying the same absolute paths were untracked.

**A Dockerfile that could not fail.** `RUN pip install -e "." | tail -5` takes
its exit status from `tail`, which always succeeds. A failed install produced a
working image with no dependencies in it and no error. Rewritten around `uv
sync --frozen` with no pipe.

**An image built with no schemas on its classpath.** The core image flattened
the service to `/app`, which broke the relative path the Gradle build uses to
find `contracts/`. The `Copy` task reported `NO-SOURCE` and skipped silently —
a green build producing a jar whose validator would throw at startup. The image
now mirrors the repository layout, and a separate verification task fails the
build if the schema directory is empty.

**A topic init script that could not fail either.** Every command ended in
`|| true`, so an unreachable broker produced a green `make up` and a stack with
no topics. It now fails loudly and tolerates only "topic already exists". Two
related bugs surfaced once it could report failure: `rpk cluster config set`
talks to the Admin API on 9644, so it rejects `--brokers` and needs
`-X admin.hosts`.

**An outbox topic configured for compaction.** `cleanup.policy=compact` keeps
only the newest record per key. These are events — an ordered sequence of facts
— so compaction would have silently destroyed history for any repeated key,
which is precisely what an audit trail must never do.

**A container health check pointed at the weaker endpoint.** Compose probed
`/actuator/health/readiness` while the endpoint that actually round-trips the
dependencies is `/health/readiness`, so a container could have reported healthy
while unable to reach its database.

**An integration test that silently skipped, and another that silently lied.**
One was guarded by `@EnabledIf("isDockerAvailable")`, so a runner without
Docker produced a green build containing zero integration coverage. The other
started containers in `@BeforeAll` and guarded its `@DynamicPropertySource`
with null checks, so whenever Spring built the context first the overrides were
skipped and the "container" test ran against whatever was listening on
localhost. Containers now start in a static initialiser and Docker is required.

**Tests running against a different broker than production.** The suite used
Confluent Kafka while the stack runs Redpanda. Now `RedpandaContainer`, at the
same pinned tag as compose.

**A "unit" test that opened a real Kafka connection.** It mocked the datasource
and Redis but left the Kafka path live, so it took ten seconds and its result
depended on whether the developer had run `make up`. Probing behind an
interface made the aggregation logic testable with no I/O.

**Blocking I/O on the FastAPI event loop.** `readiness` was `async def` while
every probe did blocking socket work, stalling the whole process for up to the
sum of the probe timeouts. Now a plain `def`, which FastAPI dispatches to a
threadpool.

**Per-request client construction.** Both services built a Kafka `AdminClient`
per health check — a thread and a connection each time, polled every three
seconds. Now singletons.

**`json-schema-validator` 3.x is a trap.** It migrated to Jackson 3
(`tools.jackson.databind`), which cannot coexist with the Jackson 2 that Spring
Boot 3.5 manages. Pinned to the 1.5.x line with a comment explaining that the
upgrade is gated on Spring Boot, not on the version number looking newer.

**Documentation asserting things that did not exist.** `.env.example` described
a startup guard rejecting `rzp_live_` keys; there is no such guard yet.
ADR-0003 quoted specific test card numbers as Razorpay behaviour — one of them
is a Stripe test card, and quoting external specifics from memory is exactly
what [ADR-0006](adr/0006-numbers-policy.md) kind 3 forbids. Both corrected, and
the Razorpay characterisation is now explicitly flagged as unverified pending
Phase 4.

---

## 4. Verification

Run these yourself. Every row was executed against the committed tree.

| What | Command | Result |
|---|---|---|
| Toolchain present | `make preflight` | reports docker / java / uv |
| Contract drift gate | `make contracts-check` | 1 event schema, 3 API paths, no drift |
| salvage-core tests | `make test-java` | **22 passed, 0 failed, 0 skipped** |
| salvage-brain tests | `make test-python` | **12 passed** (8 unit, 4 integration) |
| Python lint | `uv run ruff check src tests` | all checks passed |
| Python types | `uv run mypy src` | strict, no issues in 7 files |
| End-to-end | `make demo` | see §5 |

### What the tests actually prove

**salvage-core — 22 tests**

*Contract (8).* The record's JSON field names are exactly the schema's
properties, so adding a field to one without the other fails the build. Every
schema-required field is present. A valid event parses. A missing required
field, an unknown field, an out-of-enum `payment_method`, a zero amount, and
malformed JSON are each rejected as contract violations rather than crashes.

*Health aggregation (6).* Liveness stays 200 even when a dependency is down.
Readiness is 200 only when every probe succeeds, 503 when any single one fails,
and reports *all* failing probes rather than stopping at the first. A
credential-bearing exception message does not appear in the response body.
Latency is non-negative.

*Ingest, against real containers (8).* An event produced to Redpanda is
consumed, validated, and persisted with the rail derived as
`issuer|method|provider`. Readiness reports all three dependencies up.
Redelivering the same event creates no second row. Two different failures on
one attempt share the attempt row. An event naming an unprovisioned merchant is
rejected rather than auto-creating a tenant. `UPDATE` and `DELETE` on
`payment_attempts` are refused by the database. A failure event cannot
reference another tenant's attempt. A taxonomy code without a classifier
version is refused.

**salvage-brain — 12 tests**

*Health (8).* The same aggregation properties as core, plus a parametrised case
per dependency, plus the credential-leak assertion.

*Attempts, against a real PostgreSQL container (4).* The readiness probe
reports up against a live database. An ingested attempt is readable with its
failures in time order and an unclassified taxonomy. A missing attempt is 404.
An attempt is not reachable through another merchant's id — 404 rather than
403, so the endpoint does not confirm that another tenant's data exists.

---

## 5. `make demo`

```
==> Starting infrastructure and services
==> Waiting for both services to report ready
==> Provisioning the demo merchant
==> Publishing a payment_failed.v1 event
==> Reading it back through salvage-brain
==> Verifying the values that came out are the values that went in
    ok  attempt id round-tripped
    ok  order id round-tripped
    ok  amount round-tripped exactly
    ok  issuer round-tripped
    ok  rail derived as issuer|method|provider
    ok  failure is unclassified (taxonomy is Phase 3)
==> Verifying redelivery does not duplicate
    ok  same event published twice, still one failure row
```

Proven: Kafka → Java consumer → schema validation → PostgreSQL → Python read
path → HTTP, with event-level deduplication, on a host with only Docker.

---

## 6. What deliberately does not exist yet

Nothing below is stubbed, mocked, or faked. It is absent.

| Not built | Phase |
|---|---|
| The simulator, calibration file, attribution window, causal-independence tests | 1 |
| Hash-chained ledger, idempotency keys, transactional outbox, distributed locking, bounds gate, kill switch, saga coordinator, reconciler, `UNKNOWN` state, chaos suite | 2 |
| Rail health, change-point detection, blast radius, failure taxonomy, root-cause attribution, point-in-time feature store, cross-tenant pooling | 3 |
| `PaymentProvider` port, `SimulatedProvider`, `RazorpayTestProvider`, recoverability model, policy, timing model, safety envelope, uncertainty escalation | 4 |
| Baselines, off-policy evaluation, bootstrap CIs, ablations, regret accounting, benchmark release | 5 |
| Decision narration, customer messaging, audit Q&A, taxonomy triage, MCP server | 6 |
| War room, autopsy, policy sandbox | 7 |
| OpenTelemetry, Prometheus, Grafana, load testing, PII scanner, auth, production compose, runbook | 8 |

### Phase 0 shortfalls, stated plainly

- **There is no dead-letter topic.** A contract-violating payload or an event
  naming an unprovisioned merchant is logged at ERROR and dropped. Both are
  deterministic — redelivery fails identically — so blocking the partition on
  infinite retry would take the consumer down without saving the message.
  Dropping is acceptable only because nothing downstream depends on it yet and
  the drop is loud. It is not acceptable once money moves, which is why the DLQ
  is a Phase 2 deliverable and not an optional improvement.
- **Event-level deduplication is not the idempotency system.** It guarantees
  redelivering the same `event_id` writes no second row. It says nothing about
  money movement, which needs the idempotency-key table, the outbox, and the
  reconciler described in [ADR-0004](adr/0004-idempotency-source-of-truth.md).
- **CI has never executed.** The workflow is written and every job's command
  has been run locally, but there is no GitHub remote yet, so no run has gone
  green on GitHub's infrastructure.
- **ADR numbering deviates from the brief.** The numbers policy was requested
  as ADR-0005 and cross-tenant rail intelligence as ADR-0006; they are 0006 and
  0007 because 0005 went to TimescaleDB licensing. ADR numbers are stable
  identifiers, so they were not renumbered after the fact.
- **The repository is on the Windows filesystem.** Gradle cannot build from
  `/mnt/c` under WSL2 (9p does not support the I/O its file hasher uses); the
  Makefile works around this by relocating the project cache, but the repository
  belongs in the WSL2 filesystem for Phase 1 onward.
