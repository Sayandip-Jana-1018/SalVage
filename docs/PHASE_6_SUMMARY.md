# Phase 6 Summary: Model Context Protocol Server (`salvage-mcp`)

## 1. Overview
Phase 6 delivers `services/salvage-mcp`, a TypeScript Model Context Protocol (MCP) server providing AI assistants and operator tooling with direct, read-only explainability, telemetry visibility, incident triaging, and counterfactual policy simulation over standard stdio transport.

---

## 2. Key Components Built

### 1. Read-Only / Advisory AI Tools (`src/tools/`)
- **`get_rail_health` (`getRailHealth.ts`)**:
  - Exposes real-time health verdicts (`HEALTHY`, `DEGRADED`, `DOWN`), sliding-window failure rates (1m, 5m, 15m), latency percentiles, and healthy alternative routing targets.
- **`explain_decision` (`explainDecision.ts`)**:
  - Assembles end-to-end causal explanations for any given `(merchant_id, payment_attempt_id)`: Ingested Attempt $\to$ Diagnostic Taxonomy $\to$ Sensing Corroboration $\to$ Expected Net Utility Ranking $\to$ Safety Bounds Gate $\to$ Distributed Locking $\to$ Ledger Audit Record.
- **`get_recovery_stats` (`getRecoveryStats.ts`)**:
  - Provides merchant-level recovery aggregates: gross recovered revenue (₹), recovery success rate (%), bounds refusal frequency, and failure distributions across taxonomy codes.
- **`list_open_incidents` (`listOpenIncidents.ts`)**:
  - Identifies active bank/issuer outages, severity tiers, and cross-tenant failure spikes requiring operator intervention.
- **`simulate_policy_change` (`simulatePolicyChange.ts`)**:
  - Runs counterfactual off-policy simulations over proposed parameter shifts (attempt caps, quiet hours gates, scheduled delays) and returns Doubly Robust estimates with 95% bootstrap confidence intervals and Kish Effective Sample Size diagnostics.

### 2. Dynamic Resources & Prompt Templates
- **Resource `salvage://rails/health` (`src/resources/index.ts`)**: Live JSON payload of the multi-tenant rail sensing matrix.
- **Prompt `incident_autopsy` (`src/prompts/index.ts`)**: Structured prompt guide for an AI assistant to conduct a complete incident autopsy for an on-call engineer.

### 3. Safety Boundary Invariant
- Every exposed MCP tool is strictly **read-only / advisory**.
- The MCP server has **zero money-movement capabilities** and executes no database state mutations.

---

## 3. Test & Verification Summary

| Suite | Component | Tests Passed | Status |
|---|---|---|---|
| MCP Tools & Clients | `salvage-mcp` (Vitest) | 10/10 Tests | **PASS** |
| Off-Policy Evaluation | `salvage-eval` (pytest) | 8/8 Tests | **PASS** |
| Simulator & Counterfactuals | `salvage-sim` (pytest) | 87/87 Tests | **PASS** |
| Sense, Diagnose & Decide | `salvage-brain` (pytest) | 61/61 Tests | **PASS** |
| Financial Core & Bounds | `salvage-core` (Gradle) | 46/46 Tests | **PASS** |
| Contract Conformance | `scripts/check_contracts.py` | 6/6 Paths | **PASS** |
| TypeScript Build | `salvage-mcp` (`tsc`) | Clean Build | **PASS** |
| Static Typing | Python (`mypy --strict`) | 30/30 Files | **CLEAN** |
| Code Formatting | Spotless & Ruff | All Files | **CLEAN** |
