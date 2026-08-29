# Phase 4 Summary: Recoverability & Policy Engine (`salvage-brain` + `salvage-core`)

## 1. Overview
Phase 4 bridges diagnostic intelligence into bounded, economically optimal recovery actions. It implements the **Recoverability Estimation Model** and **Policy Decision Optimizer** inside `salvage-brain`, exposes `POST /v1/decide`, and connects `salvage-core`'s **Bounds Engine** and **Saga Coordinator** to execute safe, tamper-evident recovery actions.

---

## 2. Key Components Built

### 1. Universal Recoverability Estimation (`salvage_brain.policy.recoverability`)
- **Conditional Recovery Predictor**: Computes $P(\text{recovery} \mid a, \mathbf{x}, \text{rail\_state}, \text{diagnosis})$.
- **Causal Calibration**:
  - `RETRY_IMMEDIATE`: Calibrated high ($0.82$) on transient network timeouts with healthy rails; throttled ($\le 0.05$) on systemic issuer outages or insufficient funds.
  - `RETRY_SCHEDULED`: Calibrated high ($0.78$) on insufficient funds with Indian salary cycle pre-payday pressure (scheduled post-payday); calibrated high ($0.75$) post-outage episode.
  - `SWITCH_RAIL`: Calibrated high ($0.85$) on issuer outages when healthy alternative rails exist.
  - `CUSTOMER_NUDGE`: Calibrated high ($0.68$) for customer abandoned or expired cards via WhatsApp/SMS checkout links.
  - `NO_ACTION`: Fail-closed boundary with zero recovery probability on fatal errors (e.g. invalid mandate).

### 2. Expected Net Utility Policy Optimizer (`salvage_brain.policy.optimizer`)
- **Optimization Objective**:
  $$\mathbb{E}[\text{Net Utility}(a)] = P(\text{recovery} \mid a) \times \text{amount\_paise} - \text{cost}(a) - \text{friction\_penalty}$$
- **Optimal Action Selection**: $a^* = \arg\max \mathbb{E}[\text{Net Utility}(a)]$.
- **Fail-Closed Guarantee**: If $\max \mathbb{E}[\text{Net Utility}(a)] \le 0$, the engine deterministically falls back to `NO_ACTION`.
- **Optimal Parameter Synthesizer**: Automatically computes payday-anchored schedule delays, healthy target rails, and communication channels.

### 3. Contract-First API (`contracts/openapi/brain.v1.yaml`)
- Added `POST /v1/decide` with request schema `PolicyDecisionRequest` and response schema `PolicyDecisionResponse`.
- Mechanically verified with zero drift against `scripts/check_contracts.py`.

### 4. Financial Execution Core & Bounds Enforcement (`salvage-core`)
- **Flyway Migration `V3__recovery_decisions.sql`**: Added tamper-evident, append-only `salvage.recovery_decisions` table with immutable PostgreSQL mutation triggers.
- **Resilient REST Client (`BrainClient.java`)**: Configured with strict timeouts and automatic fail-closed fallback to `NO_ACTION` when brain is unreachable or degraded.
- **End-to-End Orchestrator (`RecoveryPolicyExecutor.java`)**:
  1. Requests intelligence decision from `BrainClient.decide(...)`.
  2. Evaluates recommendation against non-bypassable `BoundsEngine` (Kill Switches, Attempt Caps $\le 3$, Quiet Hours 22:00–08:00 IST, Opt-Outs, Contact Quotas).
  3. If **PERMITTED**: Acquires per-customer distributed lock via Redis `DistributedLockManager`, initiates recovery saga in `SagaCoordinator`, advances saga state, and appends audit record to `LedgerService`.
  4. If **REJECTED**: Records bounds rejection reason in `LedgerService`, persists immutable decision audit, and takes NO-OP (zero money movement, fail closed).

---

## 3. Test & Verification Results

| Suite | Component | Tests Passed | Status |
|---|---|---|---|
| Contract Conformance | `scripts/check_contracts.py` | 6/6 Paths | **PASS** |
| Decision Engine & API | `salvage-brain` (pytest) | 61/61 Tests | **PASS** |
| Money Core & Bounds | `salvage-core` (Gradle) | 46/46 Tests | **PASS** |
| Causal Simulator | `salvage-sim` (pytest) | 87/87 Tests | **PASS** |
| Static Analysis | Python (`mypy --strict`, `ruff`) | 36 Source Files | **CLEAN** |
| Code Formatting | Java (`spotlessApply`) | All Classes | **CLEAN** |

---

## 4. Next Phase: Phase 5 (Off-Policy Evaluation Harness `salvage-eval`)
- Counterfactual estimators (Doubly Robust, IPS, Direct Method) for policy evaluation without risking production money.
- Offline policy benchmarking against historical replay logs.
