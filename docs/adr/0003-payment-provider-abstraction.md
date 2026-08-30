# ADR-0003: Payment Provider Abstraction

**Status:** Accepted
**Date:** 2026-08-29
**Decision:** A `PaymentProvider` port with two adapters: `SimulatedProvider` (default, deterministic, zero credentials) and `RazorpayTestProvider` (opt-in, real HTTP calls against Razorpay test mode).

## Context

The spec requires a five-minute quickstart for a stranger cloning the repository. A stranger has no Razorpay credentials. At the same time, this work is being submitted to Razorpay, and evidence of real integration with their platform carries weight that a simulated adapter cannot.

Additionally, Razorpay test mode provides deterministic test instruments (test card numbers, fixed OTPs), not a realistic issuer decline taxonomy. A system whose purpose is diagnosing decline causes cannot be meaningfully evaluated against test mode responses. This claim should be verified against current Razorpay documentation at implementation time (Phase 4).

## Decision

**Status of implementation: built.** `PaymentProvider` is a Java interface in
`com.salvage.core.payment` with two adapters.

- **`SimulatedProvider`** is the default and requires no credentials and no
  network. It is deterministic -- every outcome is SHA-256 over a seed and the
  caller's idempotency key -- so a run replays bit-identically. It enforces
  idempotency the way a gateway does, and it models the failure mode that
  matters most: a share of calls return `UNKNOWN` (the call timed out), and of
  those a share **actually captured the money**. The caller cannot tell which
  without a status read. That asymmetry is what makes the double-charge bug
  reproducible in a test rather than a story about production.
- **`RazorpayTestProvider`** issues real HTTP against Razorpay test mode.
  Activated by `SALVAGE_PAYMENT_PROVIDER=razorpay` plus `RAZORPAY_KEY_ID`,
  `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. If the provider is set
  to `razorpay` without credentials the process **refuses to start** rather
  than falling back to the simulator: an operator who asked for a gateway and
  silently got a simulation would be told about recoveries that never happened.
- **`ProviderCredentialsGuard`** refuses to start on a key beginning
  `rzp_live_`, independently of any of the above.
- **`ReconciliationGuard`** sits in front of every retry. It asks the provider
  what actually happened before this system charges anyone again.

### What has been executed against the live Razorpay API

`scripts/razorpay_e2e.sh` (`make razorpay-e2e`) has been run successfully
against Razorpay test mode. It verified Basic authentication,
`POST /payment_links`, `GET /payment_links/{id}`, and the response field names
the adapter reads. It created a real, payable test-mode payment link.

Not yet executed from this repository: `GET /payments/{id}`,
`POST /payments/{id}/refund`, and webhook verification against a signature
Razorpay actually produced. Those remain transcribed rather than verified.

### The constraint that shapes the adapter

**A gateway cannot re-charge an arbitrary failed one-off payment.** Collecting
again requires the customer to authorise it; there is no server-side call that
charges a card again on its own. Any system claiming to "retry a failed
payment" against a real gateway is using a saved token, acting under a mandate,
or lying.

So `RazorpayTestProvider.retry()` **refuses**, with an exception saying why,
rather than pretending. For one-off payments the executable recovery is a
payment link the customer chooses to pay -- which is exactly why
`CUSTOMER_NUDGE` is a first-class action and not an afterthought. Server-side
charging is available only for tokenised or mandate-backed payments, which this
adapter does not yet implement.

`SimulatedProvider.retry()` does charge, because the simulator models a world
in which tokens exist. That difference is a real property of the two
environments, not an inconsistency to be smoothed over.

## Consequences

- The quickstart works with zero credentials.
- `make razorpay-e2e` exercises the real integration for demonstrations.
- The simulated provider is not a stub or a mock — it is a documented, tested component that models payment lifecycle with configurable failure modes.
- Evaluation results are always reported against the simulated provider, with this framing stated explicitly.

## Why Both Providers Exist

Test mode gives deterministic test instruments rather than a realistic issuer decline distribution: a given test instrument produces a given outcome every time, by design. That is useful for verifying API integration — correct HTTP calls, correct authentication, correct webhook signature handling — but it cannot exercise the thing Salvage is actually about: distinguishing between many different kinds of failure and choosing a different response for each.

**Unverified at the time of writing.** The specific test instruments Razorpay publishes, and which decline reason codes test mode can be made to emit, must be read off Razorpay's current documentation during Phase 4 rather than asserted from memory. If test mode turns out to expose a richer decline taxonomy than assumed here, this ADR is wrong and gets superseded. No specific card numbers or error codes are quoted here on purpose — see ADR-0006, kind 3.

The simulated provider fills that gap with a rich, configurable failure model driven by `packages/salvage-sim/calibration.yaml`. The two providers answer different questions and both are needed.
