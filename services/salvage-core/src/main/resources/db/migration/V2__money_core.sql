-- V2__money_core.sql
-- Flyway migration for Phase 2: The Money Core.
--
-- Implements tables and invariants for:
-- 1. Append-only, hash-chained ledger (with mutation triggers).
-- 2. Multi-tier idempotency store (PostgreSQL durable fallback).
-- 3. Transactional outbox table (with SKIP LOCKED polling indexes).
-- 4. Customer opt-outs and contact budgets for hard bounds enforcement.
-- 5. Recovery sagas for state-machine workflows.
-- 6. Kill switches (system-wide and merchant-specific).

-- ---- ledger_entries -------------------------------------------------------
-- The tamper-evident, append-only ledger of every critical financial event
-- and decision. Each entry computes:
--   entry_hash = SHA-256(prev_hash + entry_index + merchant_id + entity_type + entity_id + event_type + payload + created_at)
-- The genesis entry per tenant has prev_hash = '0000000000000000000000000000000000000000000000000000000000000000'.
CREATE TABLE ledger_entries (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    entry_index   BIGINT      NOT NULL CHECK (entry_index >= 1),
    merchant_id   TEXT        NOT NULL,
    entity_type   TEXT        NOT NULL,
    entity_id     TEXT        NOT NULL,
    event_type    TEXT        NOT NULL,
    payload       TEXT        NOT NULL,
    prev_hash     TEXT        NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
    entry_hash    TEXT        NOT NULL CHECK (entry_hash ~ '^[0-9a-f]{64}$'),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_ledger_entries PRIMARY KEY (id),
    CONSTRAINT uq_ledger_merchant_index UNIQUE (merchant_id, entry_index),
    CONSTRAINT fk_ledger_entries_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
);

CREATE INDEX idx_ledger_entries_merchant_created
    ON ledger_entries (merchant_id, created_at DESC);

CREATE INDEX idx_ledger_entries_entity
    ON ledger_entries (merchant_id, entity_type, entity_id);

-- Enforce append-only semantics on ledger_entries at database level.
CREATE TRIGGER trg_ledger_entries_immutable
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION salvage.reject_mutation();

-- ---- idempotency_keys -----------------------------------------------------
-- Durable PostgreSQL backing store for idempotency keys.
-- Redis provides the sub-millisecond fast-path cache and in-flight distributed lock;
-- this table guarantees long-term durability and recovery across cache restarts.
CREATE TABLE idempotency_keys (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id         TEXT        NOT NULL,
    idempotency_key     TEXT        NOT NULL,
    status              TEXT        NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
    response_payload    JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ NOT NULL,

    CONSTRAINT pk_idempotency_keys PRIMARY KEY (id),
    CONSTRAINT uq_idempotency_merchant_key UNIQUE (merchant_id, idempotency_key),
    CONSTRAINT fk_idempotency_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
);

CREATE INDEX idx_idempotency_keys_expires
    ON idempotency_keys (expires_at);

-- ---- outbox_events --------------------------------------------------------
-- Transactional outbox table.
-- Events are committed in the same database transaction as business state changes.
-- A separate outbox publisher relays them to Kafka with at-least-once delivery.
CREATE TABLE outbox_events (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id     TEXT        NOT NULL,
    aggregate_type  TEXT        NOT NULL,
    aggregate_id    TEXT        NOT NULL,
    event_type      TEXT        NOT NULL,
    payload         JSONB       NOT NULL,
    topic           TEXT        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
    retry_count     INT         NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ,

    CONSTRAINT pk_outbox_events PRIMARY KEY (id),
    CONSTRAINT fk_outbox_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
);

CREATE INDEX idx_outbox_events_status_created
    ON outbox_events (status, created_at ASC)
    WHERE status = 'PENDING';

-- ---- opt_outs -------------------------------------------------------------
-- Hard bounds: customer communication opt-outs.
-- Must be queried before every outbound message/nudge with zero bypass routes.
CREATE TABLE opt_outs (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id     TEXT        NOT NULL,
    customer_id     TEXT        NOT NULL,
    channel         TEXT        NOT NULL CHECK (channel IN ('SMS', 'WHATSAPP', 'EMAIL', 'CALL', 'ALL')),
    reason          TEXT,
    opted_out_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_opt_outs PRIMARY KEY (id),
    CONSTRAINT uq_opt_outs_customer_channel UNIQUE (merchant_id, customer_id, channel),
    CONSTRAINT fk_opt_outs_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
);

CREATE INDEX idx_opt_outs_lookup
    ON opt_outs (merchant_id, customer_id);

-- ---- contact_budgets ------------------------------------------------------
-- Hard bounds: per-customer contact quotas per rolling time window (e.g. 24h).
CREATE TABLE contact_budgets (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id     TEXT        NOT NULL,
    customer_id     TEXT        NOT NULL,
    window_start    TIMESTAMPTZ NOT NULL,
    window_end      TIMESTAMPTZ NOT NULL,
    max_allowance   INT         NOT NULL DEFAULT 2 CHECK (max_allowance > 0),
    consumed_count  INT         NOT NULL DEFAULT 0 CHECK (consumed_count >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_contact_budgets PRIMARY KEY (id),
    CONSTRAINT uq_contact_budgets_window UNIQUE (merchant_id, customer_id, window_start),
    CONSTRAINT fk_contact_budgets_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id),
    CONSTRAINT ck_contact_budgets_consumed_le_max
        CHECK (consumed_count <= max_allowance)
);

CREATE INDEX idx_contact_budgets_lookup
    ON contact_budgets (merchant_id, customer_id, window_start, window_end);

-- ---- recovery_sagas -------------------------------------------------------
-- Persistent saga state for multi-step recovery workflows.
CREATE TABLE recovery_sagas (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    saga_id             UUID        NOT NULL,
    merchant_id         TEXT        NOT NULL,
    payment_attempt_id  TEXT        NOT NULL,
    current_state       TEXT        NOT NULL
                                    CHECK (current_state IN
                                          ('STARTED', 'RETRY_INITIATED', 'RAIL_SWITCH_INITIATED',
                                           'CUSTOMER_NUDGED', 'COMPENSATING', 'COMPLETED', 'FAILED')),
    current_step        INT         NOT NULL DEFAULT 0,
    payload             JSONB       NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_recovery_sagas PRIMARY KEY (id),
    CONSTRAINT uq_recovery_sagas_id UNIQUE (merchant_id, saga_id),
    CONSTRAINT fk_recovery_sagas_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
);

CREATE INDEX idx_recovery_sagas_attempt
    ON recovery_sagas (merchant_id, payment_attempt_id);

-- ---- kill_switches --------------------------------------------------------
-- Global and scoped kill switches for immediate circuit-breaking of recoveries.
CREATE TABLE kill_switches (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id     TEXT,       -- NULL represents system-wide global kill switch
    scope           TEXT        NOT NULL CHECK (scope IN ('GLOBAL', 'MERCHANT', 'RAIL')),
    target_id       TEXT,       -- optional rail_id or sub-scope
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    reason          TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_kill_switches PRIMARY KEY (id),
    CONSTRAINT fk_kill_switches_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id)
);

CREATE INDEX idx_kill_switches_scope
    ON kill_switches (scope, is_active);
