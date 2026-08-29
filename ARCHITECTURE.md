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

Neither adapter exists yet; both are Phase 4. The decision is recorded now so
that Phase 2 does not couple the money core to a provider SDK. See
[ADR-0003](docs/adr/0003-payment-provider-abstraction.md).

Razorpay test mode gives **deterministic test instruments**: a given test
instrument produces a given outcome every time, by design. That is exactly what
you want for verifying an integration — that the HTTP calls are right, the
authentication is right, the webhook signature verification is right — and it
is exactly what you cannot use to evaluate a system whose entire purpose is
telling different kinds of failure apart. A decline distribution that is fixed
by construction cannot exercise a diagnosis engine.

So the two adapters answer two different questions:

| Question | Answered by |
|---|---|
| Does the integration actually work against a real gateway? | `RazorpayTestProvider` |
| Does the diagnosis and policy machinery work? | `SimulatedProvider` |

Evaluation numbers therefore come from the simulated provider, always, and
`EVALUATION.md` says so on its first line.

**This characterisation of Razorpay test mode is not yet verified.** It must be
checked against Razorpay's current documentation during Phase 4. If test mode
exposes a richer decline taxonomy than assumed, ADR-0003 is wrong and gets
superseded rather than quietly edited.

## Exactly-Once, Stated Precisely

"Exactly-once money movement" is not achievable across a network boundary to a
third party, and naming it that hides the failure mode that actually causes
double charges. What is achievable, and what this system commits to:

> Salvage never **originates** a duplicate charge, and never retries an attempt
> whose outcome is **unknown**.

The dangerous case is not the duplicate webhook — that is easy to catch. It is
a timeout on a charge call, where the system does not know whether money moved.
An attempt in that state enters an explicit `UNKNOWN` terminal-pending state
that **only the reconciler may resolve** — never a retry handler, never a
timeout handler. See [ADR-0004](docs/adr/0004-idempotency-source-of-truth.md).

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

Steps 1–2 exist today. Steps 3–8 are Phases 3 and 4.

1. Payment fails → gateway publishes `salvage.payment-failed.v1` to Kafka
2. salvage-core consumes, validates against the published JSON Schema, and
   writes `payment_attempt` + `failure_event` in one transaction
3. salvage-core calls salvage-brain with features — **outside** the database
   transaction (see below)
4. salvage-brain returns ranked actions with scores and propensities
5. salvage-core commits the decision record **before** executing anything
6. The top action passes through the bounds gate; if it passes, execution is
   dispatched via the outbox, never inline
7. If the gate blocks it: record `NO_ACTION` with `GATE_BLOCKED:<reason>`,
   distinct from a policy-chosen `NO_ACTION`
8. Outcome observed → fed back into the feature store

### Why the brain call sits outside the transaction

Calling an external service inside a database transaction is a dual write in
disguise: if the commit fails, a decision was made and not recorded; if the
call times out, the state is unknown. Three properties remove the problem:

- **The brain is a pure function** of `(features, model_version, policy_version)`.
  The same inputs produce the same ranked list, so a retry reproduces rather
  than re-decides.
- **The request is idempotent**, keyed by `attempt_id`.
- **The decision is committed before any execution**, and execution happens
  only through the transactional outbox.

### Why `NO_ACTION` is split

A no-action that the policy *chose* and a no-action the bounds gate *forced*
are completely different events. Logging them identically biases every
off-policy estimate downstream, because the evaluator would treat a constrained
observation as a free choice. Every decision therefore records the feasible
action set alongside the chosen action, and the reason when nothing was done.
This is a Phase 4 design commitment, not a Phase 5 discovery.
