-- Salvage PostgreSQL initialisation.
-- Runs once on first container start via docker-entrypoint-initdb.d.
--
-- Two extensions:
--   timescaledb  — hypertables for rail_health_samples (Phase 3).
--   pgcrypto     — gen_random_uuid() for primary keys, and digest() for
--                  the hash-chained ledger (Phase 2).

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- All Salvage objects live in the `salvage` schema. Flyway manages
-- everything inside it; this script only creates the container.
CREATE SCHEMA IF NOT EXISTS salvage;
