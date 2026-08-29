# Salvage Architecture

> An autonomous system that diagnoses failed payments and recovers the money,
> with every decision bounded, explainable, and replayable.

## System Overview

```
                    ┌─────────────────────────────┐
                    │       Payment Gateway        │
                    │     (e.g. Razorpay)          │
                    └──────────┬──────────────────┘
                               │ payment.failed.v1
                               ▼
┌──────────────────────────────────────────────────────────┐
│                     salvage-core (Java 21)                │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────┐ │
│  │  Event    │  │ Bounds   │  │   Saga    │  │ Outbox │ │
│  │ Consumer  │→ │  Gate    │→ │Coordinator│→ │Publisher│ │
│  └──────────┘  └──────────┘  └───────────┘  └────────┘ │
│        │              │             │             │      │
│        ▼              ▼             ▼             ▼      │
│  ┌────────────────────────────────────────────────────┐  │
│  │           PostgreSQL (Ledger, State)               │  │
│  │           Redis (Cache, Locks)                     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP (decision request)
                       ▼
┌──────────────────────────────────────────────────────────┐
│                    salvage-brain (Python 3.12)            │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────┐ │
│  │   Rail   │  │  Root    │  │Recoverabi-│  │ Policy │ │
│  │  Health  │  │  Cause   │  │lity Model │  │ Engine │ │
│  └──────────┘  └──────────┘  └───────────┘  └────────┘ │
│        │              │             │             │      │
│        ▼              ▼             ▼             ▼      │
│  ┌────────────────────────────────────────────────────┐  │
│  │        Feature Store (point-in-time correct)       │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Components

### salvage-core (Java 21, Spring Boot 3)

The transactional money service. Owns everything that touches money or the
ledger. See [ADR-0001](docs/adr/0001-two-language-split.md).

**Responsibilities:**
- Consume `payment.failed.v1` events from Kafka
- Append-only, hash-chained audit ledger (per-merchant chains with global checkpoint)
- Idempotency enforcement (PostgreSQL source of truth, Redis cache — [ADR-0004](docs/adr/0004-idempotency-source-of-truth.md))
- Transactional outbox pattern for reliable event publishing
- Bounds gate: attempt caps, quiet hours, opt-outs, contact budgets, kill switch
- Saga coordinator for multi-step recovery workflows
- Recovery execution via PaymentProvider adapters ([ADR-0003](docs/adr/0003-payment-provider-abstraction.md))
- Reconciliation between local ledger and payment provider
- Multi-tenant isolation enforced at the repository layer

### salvage-brain (Python 3.12, FastAPI)

The decision service. Never moves money. Returns a recommended action and
its reasoning; salvage-core decides whether to execute it.

**Responsibilities:**
- Rail health monitoring with change-point detection
- Cross-tenant rail intelligence ([ADR-0007](docs/adr/0007-cross-tenant-rail-intelligence.md))
- Root cause attribution with counterfactual rail comparison
- Recoverability scoring with calibrated probabilities
- Budget-constrained contextual bandit policy selection
- Point-in-time correct feature store
- Model and policy registry with immutable versioning
- Shadow mode evaluation of candidate policies

### salvage-sim (Python 3.12)

Standalone simulator package generating realistic Indian payment failure
streams. Ground truth labels are causally independent of model features.
See [ADR-0006](docs/adr/0006-numbers-policy.md) for the numbers policy
governing calibration parameters.

### salvage-eval (Python 3.12)

Evaluation harness implementing off-policy evaluation (IPS, SNIPS, DM, DR),
bootstrap confidence intervals, calibration diagnostics, and regret
accounting. Generates `EVALUATION.md` from a single command.

### salvage-console (Next.js 15, TypeScript)

Operator interface: war room, autopsy view, policy sandbox.

### salvage-mcp (TypeScript)

Model Context Protocol server exposing Salvage to AI assistants.

## Why Both Providers Exist

See [ADR-0003](docs/adr/0003-payment-provider-abstraction.md). The simulated
provider models realistic failure distributions for evaluation. The Razorpay
test mode adapter proves API integration is real. They answer different
questions and both are needed.

## Where We Deliberately Did Not Use an LLM

> This section will be completed in Phase 6. The boundary is clear: money
> decisions require determinism, auditability, sub-100ms latency, and
> identical replay. A language model provides none of these.

## Technology Stack

| Component | Technology | Version |
|---|---|---|
| salvage-core runtime | Java (Temurin) | 21 LTS |
| salvage-core framework | Spring Boot | 3.5.16 |
| salvage-core build | Gradle (Kotlin DSL) | 8.12 |
| salvage-brain runtime | Python | 3.12 |
| salvage-brain framework | FastAPI + Pydantic v2 | 0.115+ |
| Database | PostgreSQL + TimescaleDB | 16 + 2.29 |
| Cache / Locks | Redis | 7.4 |
| Message bus | Redpanda (Kafka API) | 25.3 |
| Console | Next.js + TypeScript | 15 |
| ML | LightGBM, scikit-learn, ruptures | pinned in pyproject.toml |
| Observability | OpenTelemetry, Micrometer, Prometheus, Grafana | — |

## Data Flow

1. Payment fails → gateway publishes `payment.failed.v1` to Kafka
2. salvage-core consumes, writes `payment_attempt` + `failure_event`
3. salvage-core calls salvage-brain with features
4. salvage-brain returns ranked actions with scores + propensities
5. salvage-core passes top action through the bounds gate
6. If it passes: execute via PaymentProvider, write to ledger
7. If it doesn't: record `NO_ACTION` with `GATE_BLOCKED:<reason>`
8. Outcome observed → fed back into feature store
