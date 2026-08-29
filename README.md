# Salvage

An autonomous system that diagnoses failed payments and recovers the money,
with every decision bounded, explainable, and replayable.

## What It Does

When an online payment fails, the merchant sees "payment failed." Underneath
those two words sit at least fifteen genuinely different situations — issuer
overload, insufficient balance, expired card, risk engine decline, network
timeout, customer abandonment, expired mandate — each needing a different
response. They all arrive labelled identically.

Salvage sits behind a merchant's payment flow. For every failed payment it:

1. **Senses** whether the failure is part of a systemic pattern
2. **Diagnoses** the actual cause
3. **Decides** on exactly one bounded recovery action
4. **Executes** that action inside hard limits it cannot exceed
5. **Records** the entire decision in a tamper-evident ledger

Critically, **doing nothing is a first-class action** that the system can
learn to choose.

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Java 21 (JDK)
- Python 3.12+
- Node.js 20+ (for the console, Phase 7)

### Run the demo

```bash
# Clone and start infrastructure
git clone <repo-url> salvage && cd salvage
cp .env.example .env
make up        # starts PostgreSQL, Redis, Redpanda

# Run tests
make test

# Run the demo (processes a simulated failure stream end-to-end)
make demo
```

### With Razorpay test mode (optional)

```bash
# Add your Razorpay TEST mode credentials to .env:
# SALVAGE_PAYMENT_PROVIDER=razorpay
# RAZORPAY_KEY_ID=rzp_test_...
# RAZORPAY_KEY_SECRET=...
# RAZORPAY_WEBHOOK_SECRET=...

make razorpay-e2e
```

## Project Structure

```
salvage/
  services/
    salvage-core/      # Java 21 — transactional money service
    salvage-brain/     # Python 3.12 — ML decision service
    salvage-mcp/       # TypeScript — MCP server (Phase 6)
  packages/
    salvage-sim/       # Python — payment failure simulator (Phase 1)
    salvage-eval/      # Python — evaluation harness (Phase 5)
  apps/
    salvage-console/   # Next.js — operator interface (Phase 7)
  contracts/
    events/            # JSON Schema — shared event definitions
    openapi/           # OpenAPI 3.1 — API contracts
  docs/
    adr/               # Architecture decision records
  ops/
    postgres/          # Database init scripts
    redpanda/          # Kafka topic definitions
    grafana/           # Dashboard provisioning (Phase 8)
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, components, data flow
- [EVALUATION.md](EVALUATION.md) — performance claims with methodology
- [DECISIONS.md](DECISIONS.md) — index of architecture decision records
- [docs/OPEN_NUMBERS.md](docs/OPEN_NUMBERS.md) — gaps where real-world data would strengthen claims

## Engineering Principles

1. **Never originate a duplicate charge**, under any failure mode
2. **Every decision replayable** — bit-identical from the same inputs
3. **Bounds enforced in code** — attempt caps, quiet hours, opt-outs, kill switch
4. **No LLM makes a money decision** — ever
5. **Honest measurement** — baseline comparison, confidence intervals, stated limitations
6. **Point-in-time correctness** — no future information leakage into features
7. **Fail closed** — uncertainty → no action

## Build Status

Phase 0: Foundation ✓

## License

Proprietary. All rights reserved.

## Acknowledgements

Built for the Razorpay ecosystem. Uses TimescaleDB under the
[Timescale License](https://www.timescale.com/legal/licenses)
(see [ADR-0005](docs/adr/0005-timescaledb-licensing.md)).
