# Open Numbers

Every entry here is a place where a real-world figure would strengthen the
writing. These are **not** estimates, guesses, or placeholders — they are
gaps to be filled with sourced data. See [ADR-0006](adr/0006-numbers-policy.md).

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

## Evaluation Claims

| Claim | What it would say | Likely source |
|---|---|---|
| EVALUATION.md — baseline comparison | Industry-standard retry success rate | Academic papers, gateway engineering blogs |
| EVALUATION.md — cost of blind retry | Gateway fee per failed retry attempt (₹) | Razorpay pricing page (public) |
