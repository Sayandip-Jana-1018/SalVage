# ADR-0005: TimescaleDB Licensing

**Status:** Accepted
**Date:** 2026-08-29
**Decision:** Use the Timescale-Licensed (TSL) build of TimescaleDB, not the Apache-2 OSS build.

## Context

TimescaleDB publishes two builds per version:

- **`timescale/timescaledb:X.Y.Z-pgNN`** — the default build, carrying the Timescale License (TSL). Includes continuous aggregates, compression, and other enterprise features.
- **`timescale/timescaledb:X.Y.Z-pgNN-oss`** — the Apache-2.0 licensed subset. Hypertables work but continuous aggregates and compression do not.

Phase 3 rail health monitoring wants continuous aggregates for efficient rolling windows over the `rail_health_samples` hypertable, and compression for historical data retention. These features are TSL-only.

## Decision

- We use `timescale/timescaledb:2.29.2-pg16` (the TSL build).
- The Timescale License is not OSI-approved open source. It permits free use for most purposes but restricts building a competing time-series database product. For Salvage — an application, not a database product — this restriction is irrelevant.
- If the licensing becomes a concern (e.g., a deployment environment that requires OSI-approved licenses only), the fallback is the `-oss` build with manual materialized views replacing continuous aggregates, and no transparent compression. The core hypertable functionality is Apache-2 and will continue to work.

## Consequences

- Full access to continuous aggregates and compression in Phase 3.
- The TimescaleDB dependency is not OSI open source. This is documented here and in the README.
- PostgreSQL 16 is confirmed supported by TimescaleDB 2.29.x.
