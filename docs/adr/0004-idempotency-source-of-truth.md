# ADR-0004: Idempotency Source of Truth

**Status:** Accepted
**Date:** 2026-08-29
**Decision:** PostgreSQL is the source of truth for idempotency. Redis is a read-through cache. A cache miss is always safe; Redis being down degrades latency, never correctness.

## Context

The original specification proposed Redis as the primary idempotency store with PostgreSQL as a fallback. This is backwards and dangerous for the most safety-critical property in the system.

Two sources of truth for idempotency gives you split-brain on the one thing that must never split. The invariant "never originate a duplicate charge" requires that the idempotency check and the effect commit atomically — if they can diverge, there exists a window where a duplicate can slip through.

## Decision

- Every money operation carries an idempotency key.
- The idempotency key is inserted into PostgreSQL with a `UNIQUE` constraint on `(merchant_id, idempotency_key)`, in the **same database transaction** as the state change it guards.
- If the insert succeeds, the operation proceeds. If it violates the unique constraint, the original result is returned — no retry, no re-execution.
- Redis holds a TTL'd cache of recently-seen idempotency keys. On receipt of a request, salvage-core checks Redis first: a hit returns the cached result immediately (fast path). A miss falls through to PostgreSQL (correct path).
- Redis being unavailable is handled by skipping the cache and going directly to PostgreSQL. This adds ~2-5ms of latency. It never changes an outcome.
- There is a test (`RedisDownIdempotencyTest`) that kills the Redis container mid-operation and asserts that idempotency still holds.

## The Dangerous Case

The double-charge will not come from a duplicate webhook — that is easy to catch. It will come from a **timeout on a charge call**, where the system does not know whether the money moved.

To address this:
- Payment attempts can enter an `UNKNOWN` terminal-pending state.
- Only the reconciliation poller may resolve an `UNKNOWN` attempt — never a retry handler, never a timeout handler.
- Provider-side idempotency keys are sent on every charge call, so that if the provider did process the first attempt, a retry with the same key returns the original result rather than charging again.

## Consequences

- Idempotency correctness depends only on PostgreSQL's transactional guarantees, which are well-understood and battle-tested.
- Redis is purely a performance optimisation. Its failure mode is latency, not correctness.
- The reconciliation poller is a critical component (Phase 2) that must be built to handle the UNKNOWN state.

## Alternatives Considered

- **Redis primary with Lua scripting:** Atomic within Redis, but the idempotency check and the PostgreSQL state change are still in different systems. A crash between them is the exact window where duplicates happen.
- **Distributed transaction (2PC):** Adds enormous complexity for a problem that has a simple single-database solution.
