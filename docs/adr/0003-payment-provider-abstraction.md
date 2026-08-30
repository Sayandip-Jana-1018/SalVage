# ADR-0003: Payment Provider Abstraction

**Status:** Accepted
**Date:** 2026-08-29
**Decision:** A `PaymentProvider` port with two adapters: `SimulatedProvider` (default, deterministic, zero credentials) and `RazorpayTestProvider` (opt-in, real HTTP calls against Razorpay test mode).

## Context

The spec requires a five-minute quickstart for a stranger cloning the repository. A stranger has no Razorpay credentials. At the same time, this work is being submitted to Razorpay, and evidence of real integration with their platform carries weight that a simulated adapter cannot.

Additionally, Razorpay test mode provides deterministic test instruments (test card numbers, fixed OTPs), not a realistic issuer decline taxonomy. A system whose purpose is diagnosing decline causes cannot be meaningfully evaluated against test mode responses. This claim should be verified against current Razorpay documentation at implementation time (Phase 4).

## Decision

**Status of implementation:** the live-credential guard exists. Nothing else in this section does.

`ProviderCredentialsGuard` in salvage-core refuses to start when `RAZORPAY_KEY_ID` begins with `rzp_live_`, and `ProviderCredentialsGuardTest` covers it. That control was described in this ADR and in `.env.example` for several phases before it was written, while `docs/PHASE_0_SUMMARY.md` correctly recorded that it did not exist -- the repository contradicted itself, and the user-facing file was the one that was wrong. It is built now.

The port and both adapters remain unbuilt. This ADR records the decision so that Phase 2 does not accidentally couple the money core to a specific provider SDK. The port and both adapters are Phase 4 deliverables. `make razorpay-e2e` currently exits non-zero saying exactly that.

- `PaymentProvider` is a Java interface (port) with methods for creating payment links, processing payments, issuing refunds, and verifying webhook signatures.
- `SimulatedProvider` is the default. It is deterministic (seeded), in-process, requires no credentials, and models the full payment lifecycle including realistic failure modes from the simulator's calibration. This is what `make demo` and CI use.
- `RazorpayTestProvider` issues real HTTP calls against Razorpay's test mode API. Activated by setting `SALVAGE_PAYMENT_PROVIDER=razorpay` plus providing `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` in `.env`.
- Contract tests run against recorded real responses so the adapter is provably faithful without needing live credentials in CI.
- `RazorpayTestProvider` exercises real Razorpay objects: Orders, Payment Links, Payments, Refunds, and genuine webhook signature verification (HMAC-SHA256).

## Consequences

- The quickstart works with zero credentials.
- `make razorpay-e2e` exercises the real integration for demonstrations.
- The simulated provider is not a stub or a mock — it is a documented, tested component that models payment lifecycle with configurable failure modes.
- Evaluation results are always reported against the simulated provider, with this framing stated explicitly.

## Why Both Providers Exist

Test mode gives deterministic test instruments rather than a realistic issuer decline distribution: a given test instrument produces a given outcome every time, by design. That is useful for verifying API integration — correct HTTP calls, correct authentication, correct webhook signature handling — but it cannot exercise the thing Salvage is actually about: distinguishing between many different kinds of failure and choosing a different response for each.

**Unverified at the time of writing.** The specific test instruments Razorpay publishes, and which decline reason codes test mode can be made to emit, must be read off Razorpay's current documentation during Phase 4 rather than asserted from memory. If test mode turns out to expose a richer decline taxonomy than assumed here, this ADR is wrong and gets superseded. No specific card numbers or error codes are quoted here on purpose — see ADR-0006, kind 3.

The simulated provider fills that gap with a rich, configurable failure model driven by `packages/salvage-sim/calibration.yaml`. The two providers answer different questions and both are needed.
