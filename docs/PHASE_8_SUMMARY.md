# Phase 8 Summary: Hardening & Production Operations

## 1. Overview

Phase 8 delivers the operational surface: Grafana dashboards as code, a load
and latency harness, a multi-tenant isolation drill, and an SRE runbook.

This document was rewritten after an audit. The version it replaces reported
performance figures that were not measurements of this system, and cited a
"production drill" script that executed no part of it. Both are described
below rather than quietly dropped, because a summary that silently loses its
central claims is harder to trust than one that says what happened to them.

---

## 2. Components delivered

### 1. Grafana dashboards as code (`ops/grafana/`)

`salvage_overview.json` plus declarative `datasources.yml` and
`dashboards.yml` provisioning. The dashboard defines panels for rail error
rates, decision throughput and latency, bounds refusals, and ledger
verification health.

**These panels are definitions, not evidence.** They render whatever the
metrics pipeline supplies. Nothing in this repository has been run long enough
under load to populate them meaningfully.

### 2. Load and latency harness (`scripts/stress_test.py`)

Two measurements, both of code that actually runs:

- **Schema validation cost** — times the Draft 2020-12 validator on
  `payment_failed.v1` events, in-process. This is the per-event overhead
  ADR-0002 accepts in exchange for a versioned contract.
- **Decision latency** — wall time of `POST /v1/decide` against a running
  `salvage-brain`, covering feature extraction, rail sensing, diagnosis and
  the expected-net-value optimiser over real HTTP and a real database.

It exits non-zero if the stack is not up rather than simulating it. Run
`--schema-only` for the half that needs no stack.

**No figures are quoted here.** See `docs/OPEN_NUMBERS.md` for why, and for
what would have to be true before any are.

> **What this replaced.** The previous harness reported a "Sense → Diagnose →
> Decide → Bounds" pipeline P99 of 47.05 ms against a sub-100 ms SLA. That
> pipeline was three `asyncio.sleep` calls totalling 1.5 ms behind a 50-way
> `asyncio.Queue`; it invoked no stage of the real system. The figure measured
> the asyncio event loop and appeared in `README.md` and `OPEN_NUMBERS.md` as
> a verified SLA.

### 3. Multi-tenant isolation drill

`services/salvage-core/src/test/java/com/salvage/core/chaos/MultiTenantIsolationTest.java`,
which runs under Testcontainers against a real PostgreSQL and asserts four
properties:

- ledger entries are strictly isolated between tenants
- one tenant's payment attempts are invisible to another
- a cross-tenant foreign key reference is rejected at the schema level
- saga state is partitioned by `merchant_id`

This is the real drill, and it runs in CI.

> **What this replaced.** `scripts/e2e_demo.py` was cited here as an
> "End-to-End Multi-Tenant Production Drill … All Invariants Verified". It was
> 190 lines of hardcoded `print` statements that contacted no service and
> exercised no code path, including a second implementation of the hash chain
> that hashed its own literals and then verified its own output. It named real
> merchants and real banks and attributed invented error rates to them, and
> ended by printing `ALL PRODUCTION DRILL INVARIANTS SATISFIED & VERIFIED
> (READY TO SHIP)`. It has been deleted.

For the honest end-to-end path, `make demo` runs `scripts/demo.sh`, which
publishes a real event to Kafka, lets `salvage-core` consume and persist it,
reads it back through `salvage-brain`, asserts the values round-trip, and
proves redelivery does not duplicate. It states plainly what it does not
cover.

### 4. SRE production runbook (`docs/PRODUCTION_RUNBOOK.md`)

Triage workflows for brain-offline fail-closed, issuer outage with automatic
reroute, and ledger anomalies. Emergency kill switch via Redis. Backup and
audit verification commands.

---

## 3. Test counts

Deliberately not transcribed. Every previous count in this file was stale
within days of being written, and a stale count in a summary is
indistinguishable from an invented one to a reader who does not re-run it.

```bash
make test     # every suite
make lint     # spotless, ruff, mypy --strict, contract drift gate
```

---

## 4. Known gaps at the end of Phase 8

- **No `PaymentProvider` port.** No code in this repository reaches a payment
  gateway. `make razorpay-e2e` exits non-zero saying so. See
  [ADR-0003](adr/0003-payment-provider-abstraction.md).
- **The taxonomy mappings are unverified.** `taxonomy/mapper.py` asserts
  meanings for NPCI UPI and ISO-8583 decline codes that were written from
  memory and contain at least one known internal contradiction. Top item in
  `docs/OPEN_NUMBERS.md`.
- **No performance figures.** See above.
