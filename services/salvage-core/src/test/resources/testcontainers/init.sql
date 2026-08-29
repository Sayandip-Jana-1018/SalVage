-- Testcontainers init script.
-- Mirrors ops/postgres/init/01-extensions.sql so that integration tests
-- run against the same schema as the real database.
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS salvage;
