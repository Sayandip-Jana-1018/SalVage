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

Phase 11 adds a tool that helps with the *next* unknown code rather than with
the rows in this table: `POST /v1/language/triage` asks a language model to
propose a mapping for a code the deterministic mapper cannot resolve, and files
it for human review. **It does not close anything here.** A proposal is a
suggestion to check against a specification, it is never applied, and no
confidence value is requested from the model -- a number attached to "this code
means X" is exactly what ADR-0006 kind three forbids. The rows below still need
somebody to read NPCI and ISO 8583.

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

## Our own performance

**No performance figures are recorded here, deliberately.**

This section previously held six, presented as "empirically benchmarked".
Four of them were not measurements of this system:

- The decision-latency and throughput rows (`P50 = 29.96 ms`, `P99 = 47.05 ms`,
  `1,824.1 events/sec`) came from a version of `scripts/stress_test.py` whose
  "Sense → Diagnose → Decide → Bounds pipeline" was three `asyncio.sleep`
  calls totalling 1.5 ms behind a 50-way queue. It invoked none of those
  stages. The numbers described the asyncio event loop.
- The recovery-rate and bounds-refusal rows (`53.0%`, `₹43,042.05`) came from
  an evaluation whose candidate policy held the data generator's own
  parameters. See the note in `EVALUATION.md`.

`scripts/stress_test.py` now measures schema validation in-process and the
real `POST /v1/decide` endpoint over HTTP, and refuses to run the second half
unless the stack is up. Numbers belong here once someone has run it on
hardware worth naming, alongside the hardware. A figure with no machine
attached to it is not reproducible, and a number nobody can reproduce is the
same liability as a number nobody measured.

The schema-validation cost is the one row that was measuring something real.
It is still absent, because the figure that was here cannot now be
distinguished from the fabricated ones around it and no one has re-run it.

## Evaluation Claims

| Claim | What it would say | Likely source |
|---|---|---|
| EVALUATION.md — baseline comparison | Industry-standard retry success rate | Academic papers, gateway engineering blogs |
| EVALUATION.md — cost of blind retry | Gateway fee per failed retry attempt | Razorpay pricing page (public) |

The "what it would say" column names the *kind* of number, never a value.
Two entries here previously carried parenthetical ranges — "~20-25%" and
"₹0.50 - ₹2.00" — which is precisely the hedged invention ADR-0006 kind 3
forbids. A range with a tilde in front of it is still a claim about the
outside world.
