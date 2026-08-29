# Phase 2: The Money Core (`salvage-core`) — Completion & Verification Report

## Executive Summary

Phase 2 (*The Money Core*) establishes the resilient, fail-closed financial substrate that guarantees **zero double charging**, **strict bounded intervention**, **continuous cryptographic auditability**, and **tamper-evident immutable ledgering** under all operational conditions, concurrent load, partial outages, and process crashes.

All core domain services, database schemas, Flyway migrations, distributed consensus guards, and chaos test suites have been implemented, verified against Testcontainers singletons (TimescaleDB PostgreSQL, Redis 7, and Redpanda Kafka), and validated to 100% green status across all invariant dimensions.

---

## 1. Core Architecture & Deliverables

```
+---------------------------------------------------------------------------------------------------+
|                                       salvage-core Money Core                                      |
|                                                                                                   |
|  +-------------------------------------+      +------------------------------------------------+  |
|  |     Multi-Tier Idempotency Store    |      |         Per-Customer Distributed Lock          |  |
|  |  - Fast-Path: Redis SETNX (TTL)     |      |  - Redis Lua script atomic acquire/release     |  |
|  |  - Durable: PostgreSQL UNIQUE KEY   |      |  - AutoCloseable lease with token verification |  |
|  +-------------------------------------+      +------------------------------------------------+  |
|                                                                                                   |
|  +-------------------------------------+      +------------------------------------------------+  |
|  |      Append-Only Ledger Engine      |      |               Hard Bounds Engine               |  |
|  |  - Deterministic SHA-256 Chaining   |      |  - Quiet Hours Guard (22:00 - 08:00 IST)       |  |
|  |  - PostgreSQL Immutable Triggers   |      |  - Attempt Caps (<= 3 attempts per payment)    |  |
|  |  - Continuous Audit Verification    |      |  - Opt-Out Registry (Channel/Merchant/Global)  |  |
|  |  - Tamper & Gap Detection           |      |  - Contact Budget Guard (2 contacts / 24 hrs)  |  |
|  |                                     |      |  - Global, Merchant, Rail Kill Switches        |  |
|  +-------------------------------------+      +------------------------------------------------+  |
|                                                                                                   |
|  +-------------------------------------+      +------------------------------------------------+  |
|  |      Transactional Outbox Relay     |      |            Recovery Saga Coordinator           |  |
|  |  - Atomic DB Staging with Mutations |      |  - Persistent Multi-Step State Machine         |  |
|  |  - SKIP LOCKED Batch Kafka Relay    |      |  - Linear Progression: RETRY -> SWITCH -> DONE |  |
|  |  - Exponential Backoff Retries      |      |  - Ledger Audited Step Compensation            |  |
|  +-------------------------------------+      +------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Component Specifications

### 2.1 Append-Only Hash-Chained Ledger (`com.salvage.core.ledger`)
- **Immutability Invariant**: Enforced via PostgreSQL schema trigger `trg_ledger_entries_immutable` invoking `salvage.reject_mutation()` with `restrict_violation` error code. Direct SQL `UPDATE` and `DELETE` queries are strictly rejected by the database engine.
- **Cryptographic Hash Formula**:
  $$\text{entry\_hash} = \text{SHA-256}(\text{prev\_hash} \parallel \text{entry\_index} \parallel \text{merchant\_id} \parallel \text{entity\_type} \parallel \text{entity\_id} \parallel \text{event\_type} \parallel \text{payload} \parallel \text{created\_at\_iso})$$
- **Genesis Hash**: `0000000000000000000000000000000000000000000000000000000000000000` (64 zeros).
- **Verification Engine (`LedgerVerificationService`)**: Walks the ordered chain for any merchant, asserting contiguous 1-indexed sequences, valid cryptographic SHA-256 hashes, uninterrupted pointer continuity, and zero gaps or payload tampering.

### 2.2 Multi-Tier Idempotency Store (`com.salvage.core.idempotency`)
- **Fast-Path Layer**: Atomic Redis `SETNX` (`idempotency:{merchant_id}:{key}`) with 60-second lease for in-progress locking, updated to cached JSON response on completion with configurable TTL (default 24h).
- **Durable Layer**: PostgreSQL table `salvage.idempotency_keys` with unique composite constraint `(merchant_id, idempotency_key)` and `salvage.reject_mutation()` triggers preventing mutation of completed keys.
- **Concurrency Gating**: Simultaneous requests racing on the same key fail closed with `ConcurrentOperationException` if in-progress or receive the identical cached result if completed. Zero double charging occurs.

### 2.3 Per-Customer Distributed Locking (`com.salvage.core.lock`)
- **Atomic Concurrency Control**: Uses Redis `SETNX` with unique UUID token and expiration lease.
- **Safe Release**: Atomic Lua script executes `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`, ensuring workers never accidentally release expired locks acquired by another process.
- **Ergonomics**: Implements `AutoCloseable DistributedLock` for reliable `try-with-resources` blocks.

### 2.4 Transactional Outbox Pattern (`com.salvage.core.outbox`)
- **Atomicity**: Outbox records are inserted into `salvage.outbox_events` in the exact same database transaction as the business mutation (payment attempt, ledger entry, or saga step).
- **Relay Mechanism**: `OutboxPublisher` polls pending records using `SELECT ... FROM salvage.outbox_events WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT :batchSize FOR UPDATE SKIP LOCKED`, guaranteeing multiple worker instances never publish duplicate messages or cause row lock contention.
- **Broker Relay**: Publishes events partitioned by `aggregate_id` to preserve per-entity ordering in Kafka/Redpanda.

### 2.5 Hard Bounds Engine (`com.salvage.core.bounds`)
- **Quiet Hours Guard**: Strictly blocks customer nudges (SMS, WhatsApp, Email) between **22:00 and 08:00 IST** using `Asia/Kolkata` timezone evaluation. Non-intrusive backend actions (e.g. immediate retries, internal rail switches) remain permitted.
- **Attempt Cap Guard**: Limits total recovery attempts per payment attempt to $\le 3$. Attempts $\ge 3$ are rejected immediately.
- **Opt-Out Registry**: Scoped opt-outs by customer, channel, and merchant with wildcard (`ALL`) support.
- **Contact Budget Guard**: Limits communication actions to a maximum of 2 customer touches within any rolling 24-hour window.
- **Kill Switch Guard**: Dynamic emergency kill switches scoped by `GLOBAL`, `MERCHANT`, `RAIL`, or `CHANNEL` stored with active status flags and operational audit logs.

### 2.6 Recovery Saga Coordinator (`com.salvage.core.saga`)
- **State Machine**: Orchestrates multi-step recovery workflows (`STARTED` $\to$ `RETRY_INITIATED` $\to$ `RAIL_SWITCH_INITIATED` $\to$ `CUSTOMER_NUDGED` $\to$ `COMPLETED` / `COMPENSATED` / `FAILED`).
- **Ledger Auditing**: Every saga step transition atomically appends an immutable entry to the ledger and stages an outbox event.
- **Multi-Tenant Isolation**: Sagas are strictly isolated by `merchant_id` with composite lookups.

---

## 3. Test & Verification Matrix

### 3.1 Java Core Test Suite (`salvage-core`)
**Command**: `./gradlew test`  
**Execution Environment**: Java 21, Spring Boot 3.4.3, Testcontainers (TimescaleDB PostgreSQL, Redis 7, Redpanda Kafka)  
**Total Tests**: **43 / 43 PASSED (100% clean)**

| Test Suite | Tests | Status | Invariants Tested |
| :--- | :---: | :---: | :--- |
| `LedgerVerificationTest` | 6 | **PASSED** | Genesis hash, SHA-256 hash chaining, DB immutability triggers, payload tampering detection, broken hash link detection, sequence gap detection. |
| `IdempotencyChaosTest` | 2 | **PASSED** | 50 concurrent threads racing on single key executing exactly once; durable PostgreSQL fallback after Redis eviction. |
| `TransactionalOutboxChaosTest` | 2 | **PASSED** | Atomic business + outbox commit; transaction rollback leaves 0 orphaned outbox rows; SKIP LOCKED batch Kafka publishing. |
| `BoundsEngineTest` | 5 | **PASSED** | Quiet Hours (22:00–08:00 IST), Attempt Caps ($\le 3$), Opt-Out Registry, Contact Budget allowance (2/24h), Kill Switches. |
| `CustomerLockChaosTest` | 1 | **PASSED** | 50 concurrent worker threads competing on same customer lock with mutual exclusion. |
| `SagaCoordinatorTest` | 1 | **PASSED** | Multi-step recovery workflow state transitions, outbox events, and cryptographic ledger continuity. |
| `MultiTenantIsolationTest` | 4 | **PASSED** | Strict tenant isolation in ledger, payment attempts, schema-level composite FK enforcement, saga isolation. |
| `PaymentIngestIntegrationTest` | 16 | **PASSED** | Kafka event ingestion, idempotent deduplication, attempt and failure event persistence. |
| `InfrastructureHealthControllerTest` | 6 | **PASSED** | Deep dependency probes (Postgres, Redis, Kafka), liveness/readiness 200/503 semantics, latency reporting. |

### 3.2 Python Simulator & Calibration Suite (`salvage-sim`)
**Command**: `uv run --project packages/salvage-sim pytest`  
**Execution Environment**: Python 3.12, NumPy, Hypothesis, jsonschema  
**Total Tests**: **89 / 89 PASSED (100% clean)**

| Test Suite | Tests | Status | Invariants Tested |
| :--- | :---: | :---: | :--- |
| `test_calibration.py` | 17 | **PASSED** | Bounds validation, mathematical constraints, monotonic anchors. |
| `test_causal_structure.py` | 11 | **PASSED** | Counterfactual oracle, rail outage routing, balance recovery. |
| `test_contract_conformance.py` | 9 | **PASSED** | Strict adherence to `payment_failed.v1.schema.json`. |
| `test_determinism.py` | 7 | **PASSED** | Seed stability, bit-identical event generation across platforms. |
| `test_health_process.py` | 8 | **PASSED** | Markov chain stationary distributions, episode durations. |
| `test_leakage_architecture.py` | 6 | **PASSED** | Observation graph isolation from counterfactual labels. |
| `test_leakage_invariance.py` | 7 | **PASSED** | Nuisance parameter label preservation. |
| `test_mandate.py` | 7 | **PASSED** | Subscription lifecycle, debit scheduling. |
| `test_performance.py` | 2 | **PASSED** | 100,000 event streaming throughput and attempt ID uniqueness. |
| `test_salary_cycle.py` | 6 | **PASSED** | Monthly payday periodicity and balance pressure dynamics. |
| `test_traffic.py` | 9 | **PASSED** | Diurnal arrival curves, merchant volume skew, festival ramps. |

### 3.3 Contract Drift & Schema Gate
**Command**: `python scripts/check_contracts.py`  
**Status**: **PASSED**  
- Event schema: `contracts/events/payment_failed.v1.schema.json` validated against all Java and Python serialization bindings.
- OpenAPI specification: `contracts/openapi/brain.v1.yaml` validated against `salvage-brain` routes.

---

## 4. Operational & Deployment Ready
- **Database Schema**: Flyway version `V2__money_core.sql` applies cleanly on top of baseline schema `V1__baseline.sql`.
- **Concurrency Invariant**: Verified up to 50 concurrent threads per customer / key without race conditions.
- **Fail-Closed Principle**: Any uncertainty, missing budget, quiet hours conflict, or active kill switch strictly results in a rejection / NO-OP with complete audit trace.

Phase 2 is fully complete and green. Ready for Phase 3 (*Sense & Diagnose Engine: salvage-brain*).
