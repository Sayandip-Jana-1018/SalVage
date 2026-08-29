# Salvage

An autonomous system that diagnoses failed payments and recovers the money,
with every decision bounded, explainable, and replayable.

> **Status: Phase 0 of 9 complete.** What exists today is the foundation and a
> proven end-to-end substrate. There is no decision engine, no ledger, and no
> money movement yet — those are Phases 2 through 4. Every claim below is
> something you can run.

## The problem

When an online payment fails, the merchant sees "payment failed." Underneath
those two words sit genuinely different situations — issuer overload,
insufficient balance, expired card, risk-engine decline, network timeout,
customer abandonment, expired mandate — each needing a different response.
They all arrive labelled identically.

So merchants do one of two things: nothing, or blind retry. Blind retry against
an already-degraded issuer deepens the throttling; retrying an
insufficient-funds decline immediately fails again and costs gateway fees.

## What Salvage will do

For every failed payment it **senses** whether the failure is part of a
systemic pattern, **diagnoses** the cause, **decides** on exactly one bounded
recovery action, **executes** it inside limits it cannot exceed, and
**records** the decision in a tamper-evident ledger that replays identically.

Doing nothing is a first-class action the policy can choose.

## Quick start

You need **Docker** and **bash**. Nothing else — no JDK, no Python, no Node.

```bash
git clone <repo-url> salvage && cd salvage
make demo
```

`make demo` builds both services, starts the stack, publishes a
`payment_failed.v1` event to Kafka, and asserts that the values which come back
out of the Python service are the values that went in — including that
publishing the same event twice still produces one row.

Other targets:

```bash
make up            # infrastructure only (PostgreSQL, Redis, Redpanda)
make down          # stop, keep data
make clean         # stop and delete all data
make preflight     # check your toolchain before running tests
make test          # every test (needs JDK 21 + uv, see below)
make lint          # spotless, ruff, mypy --strict, contract drift gate
make help          # all targets
```

### Running the tests

`make demo` is Docker-only. `make test` additionally needs:

| Tool | Why |
|---|---|
| JDK 21 | salvage-core. Gradle will download one if absent (foojay resolver). |
| [uv](https://docs.astral.sh/uv/) | salvage-brain. Fetches its own Python 3.12. |

`make preflight` checks all of this and tells you what is missing.

### Development environment

Developed and verified on **WSL2 / Ubuntu** with Docker Desktop. `make` is not
present on Windows by default, so run these from a WSL2 shell.

Two things are worth knowing if you are on Windows:

- **Enable Docker Desktop's WSL integration** (Settings → Resources → WSL
  Integration) or the containers are unreachable from your shell.
- **Keep the repository inside the WSL2 filesystem** (`~/salvage`), not under
  `/mnt/c`. Gradle's file hasher uses I/O the 9p driver serving `/mnt/c` does
  not support and the build fails with `java.io.IOException: Input/output
  error`. The `Makefile` works around this by relocating Gradle's project cache
  when it detects a `/mnt/` path, but builds are also several times slower
  across the boundary.

## Project structure

```
salvage/
  services/
    salvage-core/      Java 21     transactional money service
    salvage-brain/     Python 3.12 ML decision service
    salvage-mcp/       TypeScript  MCP server              (Phase 6)
  packages/
    salvage-sim/       Python      failure simulator        (Phase 1)
    salvage-eval/      Python      evaluation harness       (Phase 5)
  apps/
    salvage-console/   Next.js     operator interface       (Phase 7)
  contracts/
    events/            JSON Schema  event definitions
    openapi/           OpenAPI 3.1  API contracts
  docs/adr/            architecture decision records
  ops/                 database init, Kafka topics, dashboards
  scripts/             demo, contract checks
```

## What works today

- Docker Compose stack: PostgreSQL 16 + TimescaleDB, Redis 7, Redpanda, with
  topics created declaratively rather than by whoever produces first.
- Health endpoints in both services that round-trip all three dependencies and
  return `503` when any is unreachable. They report exception *types*, never
  messages, because the endpoint is unauthenticated and driver messages embed
  credentials.
- A Kafka consumer in salvage-core that validates every payload against the
  published JSON Schema, then writes the attempt and failure rows in one
  transaction, deduplicating on `event_id` at the database level.
- A read path in salvage-brain over those rows, scoped by merchant.
- Append-only enforcement and cross-tenant foreign keys in the schema, with
  tests that try to violate both.
- A contract drift gate that fails CI when the served API diverges from the
  committed one.

## What does not exist yet

The ledger, idempotency keys, the outbox, the bounds gate, the kill switch, the
saga coordinator, the simulator, the models, the policy, the evaluation
harness, the console, the MCP server, and any code that moves money. See
[docs/PHASE_0_SUMMARY.md](docs/PHASE_0_SUMMARY.md) for the exact boundary.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, components, data flow
- [EVALUATION.md](EVALUATION.md) — the specification the Phase 5 harness fills in
- [DECISIONS.md](DECISIONS.md) — index of architecture decision records
- [docs/OPEN_NUMBERS.md](docs/OPEN_NUMBERS.md) — where real-world figures are needed
- [docs/PHASE_0_SUMMARY.md](docs/PHASE_0_SUMMARY.md) — what Phase 0 delivered

## Engineering principles

1. **Never originate a duplicate charge**, and never retry an attempt whose
   outcome is unknown
2. **Every decision replayable** — bit-identical from the same inputs
3. **Bounds enforced in code**, not in configuration comments
4. **No LLM makes a money decision** — ever
5. **Honest measurement** — named baseline, confidence interval, stated limits
6. **Point-in-time correctness** — no future information in any feature
7. **Fail closed** — uncertainty means no action

## Licence

Proprietary. All rights reserved.

TimescaleDB is used under the [Timescale License](https://www.timescale.com/legal/licenses),
which is not OSI-approved open source — see
[ADR-0005](docs/adr/0005-timescaledb-licensing.md).
