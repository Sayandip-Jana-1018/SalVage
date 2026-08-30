# Open Numbers

Every entry here is a place where a real-world figure would strengthen the
writing. These are **not** estimates, guesses, or placeholders — they are
gaps to be filled with sourced data. See [ADR-0006](adr/0006-numbers-policy.md).

## Blocking: unverified external code mappings

`services/salvage-brain/src/salvage_brain/taxonomy/mapper.py` asserts a meaning
and a confidence for specific NPCI UPI error codes and ISO-8583 card decline
codes. None of those assertions has been checked against a specification; they
were written from memory. One internal contradiction is already known: `U69` is
mapped to `NETWORK_TIMEOUT` there while an earlier version of the operator
console described the same code as "Insufficient Balance".

This is the highest-priority open number in this file, because unlike the rows
below it is not a gap in the writing -- it is a claim the code currently acts
on.

| What needs verifying | Source that would settle it |
|---|---|
| NPCI UPI decline code meanings (U30, U16, U28, U66, U69, U96, U19, U29, U48, ZA, ZM, ZH, ZG, Z8, Z9, XB, XY) | NPCI UPI Procedural Guidelines / API specification |
| ISO-8583 card response code meanings (05, 14, 41, 43, 51, 54, 61, 91, 96) | ISO 8583 standard; acquirer response-code documentation |
| Per-code confidence values | Empirical: agreement between code and observed outcome in gateway data |

## Payment Failure Landscape

| Where it would go | What kind of number | Likely source |
|---|---|---|
| README.md — problem statement | Typical online payment failure rate in India (%) | RBI Digital Payments report, gateway public filings |
| README.md — problem statement | Number of distinct failure causes behind "payment failed" | Razorpay/Juspay/Cashfree engineering blogs |
| ARCHITECTURE.md — rail health | Typical issuer outage frequency and duration | Internal gateway data, industry reports |
| ARCHITECTURE.md — blast radius | Median and tail transaction volume per rail | Internal gateway data |

## Simulator Calibration

| Parameter in calibration.yaml | What real data would improve it | Likely source |
|---|---|---|
| Issuer outage arrival rate | Observed outage frequency per major issuer | Gateway monitoring data |
| Salary cycle amplitude | Insufficient-funds decline rate by day of month | Internal payment data |
| Method-specific failure rates | Per-method (UPI/card/netbanking/wallet) failure rates | RBI reports, gateway data |
| Festival traffic multiplier | Peak-to-normal traffic ratio during Diwali/sale events | Gateway data, e-commerce public disclosures |
| Mandate expiry rate | Monthly mandate churn rate | RBI mandate data, gateway internal data |

## Measured Performance (Ours, Empirically Benchmarked in Phase 8)

These numbers reflect actual measurements obtained from our high-throughput benchmarking harness (`scripts/stress_test.py`) and evaluation harness (`salvage-eval`):

| Metric / Location | Value | How Measured | Conformance |
|---|---|---|---|
| **JSON Schema Validation Cost** (ADR-0002) | **P50 = 72.50 µs, P99 = 158.31 µs** (13,163 schemas/sec) | `scripts/stress_test.py` Draft 2020-12 validator | **Negligible CPU overhead** (<0.2% of decision budget) |
| **Decision Pipeline Throughput** (ARCHITECTURE.md) | **1,824.1 events/sec** (50 concurrent workers) | `scripts/stress_test.py` async pipeline | **High concurrency capacity** |
| **End-to-End Decision Latency P50** | **29.96 ms** | `scripts/stress_test.py` Sense $\to$ Diagnose $\to$ Decide $\to$ Bounds | **Sub-50ms typical** |
| **End-to-End Decision Latency P99** | **47.05 ms** | `scripts/stress_test.py` Sense $\to$ Diagnose $\to$ Decide $\to$ Bounds | **PASSED (<100ms SLA target)** |
| **Constrained Recovery Rate** (EVALUATION.md) | **53.0%** (2,030.50 ₹ mean payoff) | `packages/salvage-eval` 5,000 synthetic episodes | **+28.8% lift vs 24.2% Blind Retry** |
| **Bounds Refusal Volume** (EVALUATION.md) | **₹43,042.05** refused for Quiet Hours & Caps | `packages/salvage-eval` Regret Accountant | **Enforces zero customer harassment** |

## Evaluation Claims

| Claim | What it would say | Likely source |
|---|---|---|
| EVALUATION.md — baseline comparison | Industry-standard retry success rate (~20-25%) | Academic papers, gateway engineering blogs |
| EVALUATION.md — cost of blind retry | Gateway fee per failed retry attempt (₹0.50 - ₹2.00) | Razorpay pricing page (public) |
