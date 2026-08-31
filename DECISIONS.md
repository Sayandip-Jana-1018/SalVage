# Architecture Decision Records

Every significant technical decision is recorded as an ADR in
[`docs/adr/`](docs/adr/). Each captures the context, the decision, the
consequences, and the alternatives considered.

An ADR is immutable **once the system has operated under it**. If a decision is
superseded after that, a new ADR is written referencing the old one; the
history of decisions is as important as the current state. A decision revised
within the phase that introduced it, before any code depended on it, is
corrected in place with the reversal stated in the text — see ADR-0002, which
reverses its own earlier position on Java code generation and says so.

## Index

| # | Title | Status |
|---|---|---|
| [0001](docs/adr/0001-two-language-split.md) | Two-Language Split | Accepted |
| [0002](docs/adr/0002-contracts-as-source-of-truth.md) | Contracts as Single Source of Truth | Accepted |
| [0003](docs/adr/0003-payment-provider-abstraction.md) | Payment Provider Abstraction | Accepted, not yet implemented (Phase 4) |
| [0004](docs/adr/0004-idempotency-source-of-truth.md) | Idempotency Source of Truth | Accepted, not yet implemented (Phase 2) |
| [0005](docs/adr/0005-timescaledb-licensing.md) | TimescaleDB Licensing | Accepted |
| [0006](docs/adr/0006-numbers-policy.md) | Numbers Policy | Accepted |
| [0007](docs/adr/0007-cross-tenant-rail-intelligence.md) | Cross-Tenant Rail Intelligence | Accepted, not yet implemented (Phase 3) |
| [0008](docs/adr/0008-language-model-boundary.md) | Where a Language Model Is Allowed | Accepted |

**Status meanings.** *Accepted* means the decision is made and binding.
*Not yet implemented* means the decision is recorded so that later phases do
not accidentally foreclose it — for example ADR-0003 exists now so that Phase 2
does not couple the money core to a provider SDK, even though neither adapter
will be written until Phase 4. An ADR describing something that does not exist
says so in its first section, so that reading the ADR set never overstates what
has been built.
