# Phase 7 Summary: Operator Console (`salvage-console`)

## 1. Overview
Phase 7 delivers `apps/salvage-console`, a high-density, real-time operator interface built with Next.js 15, React 19, TypeScript, and modern CSS/Tailwind. It delivers the three core operator surfaces: **The War Room**, **The Autopsy View**, and **The Policy Sandbox**.

---

## 2. Core Surfaces Built

### 1. The War Room (`/war-room`, `/`)
- **Key Metrics Ticker**: Real-time counter of live money at risk (`₹3,42,850`), 24h recovered revenue (`₹18,10,000`), recovery rate (`53.0%`), and live IST clock.
- **2D Rail Health Sensing Matrix**: 4 Major Banks (HDFC, SBI, ICICI, Axis) $\times$ 3 Payment Methods (UPI, Card, NetBanking) displaying health verdicts (`HEALTHY`, `DEGRADED`, `DOWN`), 5m sliding-window error rates, p95 latencies, and automated rerouting suggestions.
- **Active Incident Blast Radius Card**: Real-time outage monitor for degraded rails displaying root cause, affected merchant count, money at risk, and autonomous mitigation status.
- **Live Decision & Ingest Stream**: Sub-100ms incoming payment failure feed with instant taxonomy diagnosis, chosen recovery action, and safety bounds verdict.

### 2. The Autopsy View (`/autopsy`, `/autopsy/[attemptId]`)
- **Failure Dissection**: Raw gateway feedback (`U30`) mapped to normalized causal taxonomy (`ISSUER_OUTAGE` at 96% confidence) with cross-tenant corroboration (34 merchants).
- **Counterfactual Expected Net Utility Table**: Comparative ranking of all 5 candidate actions (`SWITCH_RAIL`, `RETRY_SCHEDULED`, `CUSTOMER_NUDGE`, `RETRY_IMMEDIATE`, `NO_ACTION`) with recovery probabilities, costs, friction penalties, and net utility calculations explaining why the winner was chosen.
- **Hard Safety Bounds Checklist**: Verification of AttemptCapGuard, QuietHoursGuard (22:00-08:00 IST), OptOutRegistry, and ContactBudgetGuard.
- **Cryptographic Hash-Chain Ledger Verification**: Live block verification displaying previous entry hash $\to$ current sha256 hash with tamper-evident proof: $H(i) = \text{sha256}(H(i-1) \parallel \text{payload})$.

### 3. The Policy Sandbox (`/sandbox`)
- **Interactive Hypothesis Tester**: Ask plain-English policy questions ("What if we switch to scheduled retry post-payday for insufficient funds?") evaluated against held-out off-policy replay data.
- **Doubly Robust Estimates**: Returns simulated recovery rate, incremental revenue ($\Delta ₹$), and 95% bootstrap confidence intervals.
- **Willingness to say "I don't know"**: When a hypothesis has zero support in historical data (e.g. night WhatsApp nudges during quiet hours), the sandbox **strictly refuses to fabricate an ungrounded estimate** and displays the Kish Effective Sample Size diagnostic alert.

---

## 3. Verification & Metrics

| Suite | Component | Tests Passed | Status |
|---|---|---|---|
| Operator Console | `salvage-console` (Vitest) | 6/6 Tests | **PASS** |
| Next.js 15 Build | `salvage-console` (`next build`) | Clean Build (7 static/dynamic routes) | **PASS** |
| MCP Server | `salvage-mcp` (Vitest) | 10/10 Tests | **PASS** |
| Off-Policy Evaluation | `salvage-eval` (pytest) | 8/8 Tests | **PASS** |
| Simulator & Counterfactuals | `salvage-sim` (pytest) | 87/87 Tests | **PASS** |
| Sense, Diagnose & Decide | `salvage-brain` (pytest) | 61/61 Tests | **PASS** |
| Financial Core & Bounds | `salvage-core` (Gradle) | 46/46 Tests | **PASS** |
| Contract Conformance | `scripts/check_contracts.py` | 6/6 Paths | **PASS** |
