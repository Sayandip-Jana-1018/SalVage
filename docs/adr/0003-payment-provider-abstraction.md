# ADR-0003: Payment Provider Abstraction

**Status:** Accepted
**Date:** 2026-08-29
**Decision:** A `PaymentProvider` port with two adapters: `SimulatedProvider` (default, deterministic, zero credentials) and `RazorpayTestProvider` (opt-in, real HTTP calls against Razorpay test mode).

## Context

The spec requires a five-minute quickstart for a stranger cloning the repository. A stranger has no Razorpay credentials. At the same time, this work is being submitted to Razorpay, and evidence of real integration with their platform carries weight that a simulated adapter cannot.

Additionally, Razorpay test mode provides deterministic test instruments (test card numbers, fixed OTPs), not a realistic issuer decline taxonomy. A system whose purpose is diagnosing decline causes cannot be meaningfully evaluated against test mode responses. This claim should be verified against current Razorpay documentation at implementation time (Phase 4).

## Decision

- `PaymentProvider` is a Java interface (port) with methods for creating payment links, processing payments, issuing refunds, and verifying webhook signatures.
- `SimulatedProvider` is the default. It is deterministic (seeded), in-process, requires no credentials, and models the full payment lifecycle including realistic failure modes from the simulator's calibration. This is what `make demo` and CI use.
- `RazorpayTestProvider` issues real HTTP calls against Razorpay's test mode API. Activated by setting `SALVAGE_PAYMENT_PROVIDER=razorpay` plus providing `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in `.env`.
- A startup guard in salvage-core rejects any Razorpay key prefixed `rzp_live_`. Test mode only.
- Contract tests run against recorded real responses so the adapter is provably faithful without needing live credentials in CI.
- `RazorpayTestProvider` exercises real Razorpay objects: Orders, Payment Links, Payments, Refunds, and genuine webhook signature verification (HMAC-SHA256).

## Consequences

- The quickstart works with zero credentials.
- `make razorpay-e2e` exercises the real integration for demonstrations.
- The simulated provider is not a stub or a mock — it is a documented, tested component that models payment lifecycle with configurable failure modes.
- Evaluation results are always reported against the simulated provider, with this framing stated explicitly.

## Why Both Providers Exist

Test mode gives deterministic test instruments rather than a realistic issuer decline distribution. A payment `4111 1111 1111 1111` always succeeds; a payment `4000 0000 0000 0002` always declines. This is useful for verifying API integration (correct HTTP calls, correct auth, correct webhook handling) but cannot exercise the thing Salvage is actually about: distinguishing between fifteen different kinds of failure and choosing different responses for each.

The simulated provider fills that gap with a rich, configurable failure model driven by `packages/salvage-sim/calibration.yaml`. The two providers answer different questions and both are needed.
