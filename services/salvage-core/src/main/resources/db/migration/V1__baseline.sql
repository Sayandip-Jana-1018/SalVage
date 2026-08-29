-- V1__baseline.sql
-- Flyway baseline migration for Salvage.
--
-- Phase 0 creates only the minimum structure needed to prove the stack works:
-- a merchants table (multi-tenant root) and the payment_attempts table
-- (immutable, one row per attempt). The full data model arrives in Phase 2.
--
-- Every table lives in the `salvage` schema. The schema itself is created by
-- ops/postgres/init/01-extensions.sql on first container start.

SET search_path TO salvage, public;

-- ---- merchants ------------------------------------------------------------
-- Multi-tenant root. Every query in the system is scoped by merchant_id,
-- enforced at the repository layer.
CREATE TABLE merchants (
    merchant_id  TEXT        NOT NULL,
    name         TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    active       BOOLEAN     NOT NULL DEFAULT TRUE,

    CONSTRAINT pk_merchants PRIMARY KEY (merchant_id)
);

-- ---- payment_attempts -----------------------------------------------------
-- One row per attempt against a payment. Immutable once written. The
-- (merchant_id, payment_attempt_id) pair is the natural key; the internal
-- id is a generated UUID for foreign-key convenience.
CREATE TABLE payment_attempts (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id         TEXT        NOT NULL,
    order_id            TEXT        NOT NULL,
    payment_attempt_id  TEXT        NOT NULL,
    amount_paise        BIGINT      NOT NULL CHECK (amount_paise > 0),
    currency            TEXT        NOT NULL DEFAULT 'INR',
    payment_method      TEXT        NOT NULL,
    provider            TEXT        NOT NULL,
    issuer              TEXT        NOT NULL,
    customer_id         TEXT,
    is_recurring        BOOLEAN     NOT NULL DEFAULT FALSE,
    mandate_id          TEXT,
    raw_event           JSONB       NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_payment_attempts       PRIMARY KEY (id),
    CONSTRAINT uq_payment_attempts_key   UNIQUE (merchant_id, payment_attempt_id),
    CONSTRAINT fk_payment_attempts_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
);

CREATE INDEX idx_payment_attempts_order
    ON payment_attempts (merchant_id, order_id);

CREATE INDEX idx_payment_attempts_customer
    ON payment_attempts (merchant_id, customer_id)
    WHERE customer_id IS NOT NULL;

-- ---- failure_events -------------------------------------------------------
-- A failure observed on an attempt. Carries the raw provider error code and
-- the normalised taxonomy code (null until Phase 3 wires the taxonomy).
CREATE TABLE failure_events (
    id                       UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id              TEXT        NOT NULL,
    payment_attempt_id       UUID        NOT NULL,
    provider_error_code      TEXT        NOT NULL,
    provider_error_desc      TEXT,
    taxonomy_code            TEXT,
    taxonomy_version         TEXT,
    rail_id                  TEXT        NOT NULL,
    event_timestamp          TIMESTAMPTZ NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_failure_events PRIMARY KEY (id),
    CONSTRAINT fk_failure_events_attempt
        FOREIGN KEY (payment_attempt_id) REFERENCES payment_attempts (id)
);

CREATE INDEX idx_failure_events_rail
    ON failure_events (rail_id, event_timestamp DESC);

CREATE INDEX idx_failure_events_merchant_time
    ON failure_events (merchant_id, event_timestamp DESC);
