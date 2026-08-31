# ADR-0009: API Authentication and Tenant Binding

**Status:** Accepted
**Date:** 2026-08-31
**Decision:** Every API route in both services requires a bearer API key. Keys carry a scope, a merchant-scoped key may address exactly one tenant, and the refusal is a 404. Configuration stores hashes, never keys. Both services refuse to start unauthenticated unless told to explicitly.

## Context

Until this decision, every HTTP route in salvage-core and salvage-brain served
whoever could reach the port. The tenant was a path parameter —
`/api/v1/ledger/merchants/{merchantId}/entries` — and nothing checked whether
the caller was entitled to it. Reading another merchant's hash-chained ledger,
their payment attempts, their decision telemetry, was a matter of editing a URL.

This was known and written down. `LedgerController`'s class comment said so, the
runbook said so, and the compose file published the service on localhost partly
because of it. What was missing was not awareness; it was the work.

The gap is worth naming precisely, because the repository already had a test
called `MultiTenantIsolationTest` and it passed. That test proves the
*repository layer* scopes its queries — that `findByMerchantId` cannot return
another tenant's rows. True, valuable, and beside the point when the caller
chooses the merchant id. Isolation enforced beneath an unauthenticated entry
point is a lock on an open door.

Nothing else in this system matters commercially until this does. A
tamper-evident ledger that anyone can read is a demonstration, not a product.

## Decision

### Bearer API keys, two scopes

`Authorization: Bearer <key>` on every route except the exemptions below.

- **`merchant`** — bound to exactly one `merchant_id`. A request for any other
  tenant is refused.
- **`operator`** — may address every tenant. What the console runs as, because
  an operator switching merchants during an incident is a real workflow. A
  separate scope so that it is granted deliberately, is visible in a log, and is
  never issued to a merchant.

### The refusal is a 404, not a 403

A 403 tells the caller that the tenant they named exists. That is precisely the
fact somebody enumerating merchant ids is trying to establish. A merchant key
reaching for another tenant gets the same answer as one reaching for a merchant
that was never provisioned.

The exception is a resource that spans tenants — currently only
`GET /v1/sensing/rails`, the rail health matrix. There is no existence to
conceal there, the caller already knows the endpoint exists, and the honest
refusal names the reason. That is a **403**, and it says that a per-tenant view
is ADR-0007 work that does not exist yet.

### Configuration holds hashes

`SALVAGE_API_KEYS` carries `scope:merchant_id:sha256` entries. The key itself is
printed once by `scripts/generate_api_key.sh` and stored nowhere by this
repository. A leak of the configuration — an environment dump, a container
inspect, a log line that should not have existed — does not leak a usable
credential, for the same reason a password file holds hashes.

Every malformed entry is a startup failure. No entry is skipped: a store that
silently dropped one would deny a real caller with no explanation, and one that
silently accepted a malformed entry might match nothing, or match more than its
author intended.

### Fail closed, and loudly

`SALVAGE_AUTH_REQUIRED` defaults to **true**, and a service with no keys
configured **refuses to start**. Running unauthenticated stays possible, because
the quickstart needs it, and it takes an explicit environment variable plus a
warning logged at startup. `docker-compose.yml` sets it false with a comment;
`docker-compose.prod.yml` does not set it at all.

A process that exits is impossible to miss in a way that a log line is not.

### Two exemptions, both deliberate

- **Health probes.** A load balancer holds no credential. The readiness probe
  already reports a dependency's exception *type* rather than its message,
  precisely because it answers unauthenticated callers.
- **`POST /api/v1/webhooks/payments`.** A payment gateway does not hold a
  Salvage API key. That route authenticates a *signature* — constant-time
  HMAC-SHA256 over the raw bytes, verified before anything is parsed — which is
  a stronger check than a bearer token and the only one the sender can satisfy.
  Putting it behind the key filter would break inbound webhooks and buy nothing.

### Authorisation resolves before anything else

In salvage-brain this meant moving two checks out of handler bodies and into
route dependencies. FastAPI resolves decorator dependencies before parameter
ones, and a handler body runs only after *every* dependency has — including the
language model, which answers 503 when the layer is off. With the check in the
body, an unauthorised caller learned whether a feature was enabled before being
told they could not use it. Small, and free to fix.

## Consequences

- **Not enforced by a framework.** salvage-core uses one `OncePerRequestFilter`
  rather than Spring Security. One filter with one job is readable in a sitting;
  a filter chain, a context holder and an expression language are not, and the
  security-relevant behaviour of this service should be readable.
- **A test walks the application** and fails the build on any route that does
  not depend on the authenticator, with an allowlist of exactly the two health
  probes. That test found its own vacuity on first run — this FastAPI version
  defers `include_router`, so walking only the top level found zero routes and
  the guarantee passed by checking nothing. The vacuity guard beside it caught
  that.
- **A defect surfaced immediately.** `ApiExceptionHandler` caught
  `Exception.class` and turned every deliberate status into a 500, including the
  404 raised by a tenant refusal. Access control was working and reporting
  itself as a server fault. A `ResponseStatusException` handler now passes the
  status through.
- **The console runs as an operator key**, so it can address every tenant. It
  has no login of its own. That is stated in `docs/DEPLOYMENT.md` rather than
  implied, and it is why the console belongs behind an existing SSO on an
  internal network.
- **The key never reaches a browser.** It is read from `SALVAGE_API_KEY`
  server-side. `NEXT_PUBLIC_` would inline it into the client bundle, which for
  a credential means publishing it.

## What this deliberately does not do

- **No expiry, no revocation list.** Revoking a key is deleting its entry and
  restarting. Workable for a handful of pilot tenants; it does not scale to
  self-service, and pretending otherwise would be worse than saying it.
- **No audit log of reads.** Writes land in the hash-chained ledger. Reads are
  not recorded, so "who looked at this merchant's data" is unanswerable today.
- **No rate limiting.** The bounds engine limits what Salvage does to a
  customer. Nothing limits what a caller does to Salvage; that belongs in the
  reverse proxy.
- **No OAuth, no JWT, no per-endpoint scopes.** Two scopes cover the two things
  that exist. A third should require an argument, because every scope is a new
  way for a caller to reach data somebody assumed they could not.

## Alternatives considered

**mTLS between services.** Stronger, and it solves a different problem: it
authenticates the *caller's process*, not the tenant they may address. Tenant
binding would still have to be built on top, and certificate distribution for
merchant integrations is a support burden nobody here can carry yet.

**Spring Security and an OAuth2 resource server.** The right answer at the point
where there are user accounts, roles, and token lifetimes. Today it would add a
large dependency and a layer of indirection to express "one key, one tenant",
and would make the most security-relevant code in the service harder to read.
Revisit when the console has its own users.
