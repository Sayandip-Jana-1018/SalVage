# Phase 3: Sense & Diagnose Engine (`salvage-brain`) — Completion & Verification Report

## Executive Summary

Phase 3 (*Sense & Diagnose Engine*) establishes the core diagnostic intelligence substrate of Salvage within `salvage-brain`. It ingests raw failure events, assesses real-time systemic payment rail health, extracts point-in-time contextual features without future data leakage, and outputs structured, explainable diagnoses with calibrated confidence scores and recommended recovery tags.

The non-negotiable architectural invariant is preserved: **`salvage-brain` senses, diagnoses, and recommends; it NEVER moves money or executes mutations.**

---

## 1. Core Architecture & Deliverables

```
                                  [ Payment Failure Event ]
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │        FastAPI Ingest & Routing Layer        │
                      └──────────────────────┬───────────────────────┘
                                             │
                     ┌───────────────────────┴───────────────────────┐
                     ▼                                               ▼
         ┌───────────────────────────┐                   ┌───────────────────────────┐
         │ Universal Failure Taxonomy│                   │ Real-Time Health Sensing  │
         │  - 8 Canonical Categories │                   │ - Sliding Windows (1m/5m) │
         │  - Exact code & Regex map │                   │ - Success Rate / Velocity │
         │  - Baseline confidence    │                   │ - Outage / Spike Detect   │
         └─────────────┬─────────────┘                   └─────────────┬─────────────┘
                       │                                               │
                       └───────────────────────┬───────────────────────┘
                                               │
                                               ▼
                                 ┌───────────────────────────┐
                                 │   Point-in-Time Features  │
                                 │   - Zero future leakage   │
                                 │   - Salary cycle window   │
                                 │   - Customer failure rate │
                                 └─────────────┬─────────────┘
                                               │
                                               ▼
                                 ┌───────────────────────────┐
                                 │   Sense & Diagnose Engine │
                                 │   - Multi-Hypothesis Rank │
                                 │   - Systemic Corroboration│
                                 │   - Explainability Reason │
                                 │   - Suggested Recovery Tag│
                                 └─────────────┬─────────────┘
                                               │
                                               ▼
                         [ DiagnosisResponse (explainable, calibrated) ]
```

---

## 2. Component Specifications

### 2.1 Universal Failure Taxonomy (`salvage_brain.taxonomy`)
- **Canonical Categories**:
  - `INSUFFICIENT_FUNDS`: Low balance, account limits exceeded.
  - `ISSUER_OUTAGE`: Bank CBS inoperative, 5xx server failures, downtime spikes.
  - `NETWORK_TIMEOUT`: Transient gateway, NPCI, or switch timeouts.
  - `MANDATE_INVALID`: Expired, revoked, or invalid recurring subscription mandates.
  - `CARD_EXPIRED`: Card validity date expired or invalid instrument.
  - `RISK_DECLINE`: Velocity limits, fraud block, blacklisted card.
  - `CUSTOMER_ABANDONED`: Payer aborted, 2FA/OTP timeout, dropped flow.
  - `UNKNOWN`: Fallback for unmapped or ambiguous error codes (confidence capped at 0.30).
- **Classification Engine**: Exact table lookup across NPCI UPI codes (`U30`, `ZM`, `ZA`, `U16`, `XB`, `ZH`, etc.), ISO-8583 card response codes (`51`, `54`, `91`, `41`, etc.), and regex fallback on error descriptions.

### 2.2 Real-Time Rail Health Sensing (`salvage_brain.sensing`)
- **Sliding Window Tracking**: Evaluates transaction streams across 1-minute, 5-minute, and 15-minute windows per `rail_id` (`issuer|method|provider`).
- **Health State Machine**:
  - `HEALTHY`: $SR_{5m} \ge 0.95$ and low failure velocity.
  - `DEGRADED`: $0.70 \le SR_{5m} < 0.95$ or $SR_{1m} < 0.70$.
  - `DOWN`: $SR_{5m} < 0.70$ or $\ge 3$ consecutive gateway timeouts.

### 2.3 Point-in-Time Feature Store (`salvage_brain.features`)
- **Zero Future Leakage Invariant**: All feature lookups enforce $t \le \text{observation\_timestamp}$ on all database queries. Offline evaluations and live production requests produce bit-identical feature representations.
- **Contextual Signals**:
  - Customer historical attempt count and failure rate.
  - Indian salary cycle calendar anchors in `Asia/Kolkata` (pre-payday balance pressure days 20–27 vs payday days 28–31 & 1–7).
  - Transaction amount log scale, payment method, recurring flag, and rail identifier.

### 2.4 Sense & Diagnose Engine (`salvage_brain.diagnosis`)
- **Systemic Corroboration**: If a payment fails with `NETWORK_TIMEOUT` or ambiguous signals but the rail health tracker senses that the rail is `DOWN`, the diagnosis elevates root cause to `ISSUER_OUTAGE` ($confidence \ge 0.95$) and adds explainability token `SYSTEMIC_OUTAGE_CORROBORATED`.
- **Explainability Tokens**: Output array of machine-verifiable tags explaining the inference (e.g. `["exact_code:U30", "PRE_PAYDAY_BALANCE_PRESSURE", "RAIL_STATE_HEALTHY"]`).
- **Action Recommendations**: Recommends `RETRY_IMMEDIATE`, `RETRY_SMART_SCHEDULE`, `SWITCH_RAIL`, `CUSTOMER_NUDGE`, or `NO_ACTION` for downstream consumption by `salvage-core` bounds engines.

---

## 3. Test & Verification Matrix

### 3.1 Python Brain Test Suite (`salvage-brain`)
**Command**: `uv run --project services/salvage-brain pytest`  
**Total Tests**: **51 / 51 PASSED (100% clean)**

| Test Module | Tests | Status | Invariants Verified |
| :--- | :---: | :---: | :--- |
| `test_taxonomy.py` | 27 | **PASSED** | NPCI, ISO-8583, simulator error code mapping, regex description fallback, unknown code fallback. |
| `test_sensing.py` | 4 | **PASSED** | Sliding window calculation (1m/5m/15m), degradation transition, consecutive timeout spike detection. |
| `test_diagnosis.py` | 5 | **PASSED** | Taxonomy reasoning, systemic outage corroboration, salary cycle pressure, explainability tokens. |
| `test_diagnosis_api.py` | 3 | **PASSED** | FastAPI `/v1/diagnose` and `/v1/sensing/rails` endpoints against real TimescaleDB PostgreSQL container. |
| `test_attempts_integration.py` | 4 | **PASSED** | Scoped read path, multi-tenant 404 isolation, DB migration compatibility. |
| `test_health.py` | 8 | **PASSED** | Liveness, readiness, dependency probes (Postgres, Redis, Kafka). |

### 3.2 Static Typing & Linting
- `ruff check`: **PASSED (Zero lint warnings)**
- `mypy --strict`: **PASSED (Zero type errors in 27 source files)**
- `scripts/check_contracts.py`: **PASSED (100% match across all 5 OpenAPI routes and schemas)**

### 3.3 Cross-Service Parity & Sim Matrix
- `salvage-core`: **43 / 43 tests PASSED**.
- `salvage-sim`: **89 / 89 tests PASSED**.

---

## 4. Summary of API Contracts
- `POST /v1/diagnose`: Accepts `{ merchant_id, payment_attempt_id, observation_timestamp? }`, returns calibrated `DiagnosisResponse`.
- `GET /v1/sensing/rails`: Returns real-time health matrix of all active payment rails.
- `GET /v1/attempts/{merchant_id}/{payment_attempt_id}`: Point-in-time attempt read path.
- `GET /healthz/liveness` & `GET /healthz/readiness`: Orchestration health probes.

Phase 3 is complete and green. Ready for Phase 4 (*Recoverability & Policy Engine*).
