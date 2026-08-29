-- V1__baseline.sql
-- Flyway baseline migration for Salvage.
--
-- Phase 0 creates only the structure needed to prove the stack works end to
-- end: the multi-tenant root, the immutable attempt record, and the failure
-- event observed on it. The ledger, outbox, idempotency, bounds, and decision
-- tables arrive in Phase 2.
--
-- Every table lives in the `salvage` schema, created by
-- ops/postgres/init/01-extensions.sql on first container start.

-- ---- merchants ------------------------------------------------------------
-- Multi-tenant root. Every query in the system is scoped by merchant_id.
CREATE TABLE merchants (
    merchant_id  TEXT        NOT NULL,
    name         TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    active       BOOLEAN     NOT NULL DEFAULT TRUE,

    CONSTRAINT pk_merchants PRIMARY KEY (merchant_id)
);

-- ---- payment_attempts -----------------------------------------------------
-- One row per attempt against a payment. Immutable once written -- enforced
-- by trg_payment_attempts_immutable below, not by convention.
--
-- The surrogate `id` exists for foreign-key convenience. The natural key is
-- (merchant_id, payment_attempt_id), which is what the consumer deduplicates
-- on when the same event is delivered twice.
CREATE TABLE payment_attempts (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id         TEXT        NOT NULL,
    order_id            TEXT        NOT NULL,
    payment_attempt_id  TEXT        NOT NULL,
    amount_paise        BIGINT      NOT NULL CHECK (amount_paise > 0),
    currency            TEXT        NOT NULL DEFAULT 'INR'
                                    CHECK (currency ~ '^[A-Z]{3}$'),
    payment_method      TEXT        NOT NULL
                                    CHECK (payment_method IN
                                          ('upi','card','netbanking','wallet','emandate')),
    provider            TEXT        NOT NULL,
    issuer              TEXT        NOT NULL,
    customer_id         TEXT,
    is_recurring        BOOLEAN     NOT NULL DEFAULT FALSE,
    mandate_id          TEXT,
    raw_event           JSONB       NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_payment_attempts     PRIMARY KEY (id),
    CONSTRAINT uq_payment_attempts_key UNIQUE (merchant_id, payment_attempt_id),
    CONSTRAINT fk_payment_attempts_merchant
        FOREIGN KEY (merchant_id) REFERENCES merchants (merchant_id),

    -- Referenced by the composite foreign key on failure_events. Without a
    -- unique constraint carrying merchant_id, a child row could point at a
    -- parent belonging to a different tenant and the database would allow it.
    CONSTRAINT uq_payment_attempts_id_merchant UNIQUE (id, merchant_id)
);

CREATE INDEX idx_payment_attempts_order
    ON payment_attempts (merchant_id, order_id);

CREATE INDEX idx_payment_attempts_customer
    ON payment_attempts (merchant_id, customer_id)
    WHERE customer_id IS NOT NULL;

-- ---- failure_events -------------------------------------------------------
-- A failure observed on an attempt. Carries the raw provider error code and
-- the normalised taxonomy code (null until Phase 3 wires the taxonomy).
--
-- event_id is the producer's event identifier and is UNIQUE per tenant: this
-- is what makes redelivery of the same Kafka message a no-op rather than a
-- duplicate row.
CREATE TABLE failure_events (
    id                       UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id              TEXT        NOT NULL,
    event_id                 UUID        NOT NULL,
    payment_attempt_id       UUID        NOT NULL,
    provider_error_code      TEXT        NOT NULL,
    provider_error_desc      TEXT,
    taxonomy_code            TEXT,
    taxonomy_version         TEXT,
    rail_id                  TEXT        NOT NULL,
    event_timestamp          TIMESTAMPTZ NOT NULL,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_failure_events PRIMARY KEY (id),
    CONSTRAINT uq_failure_events_event UNIQUE (merchant_id, event_id),

    -- Composite FK: the referenced attempt must belong to the SAME merchant.
    -- A plain FK on payment_attempt_id alone would permit a failure event in
    -- tenant A to reference an attempt in tenant B.
    CONSTRAINT fk_failure_events_attempt
        FOREIGN KEY (payment_attempt_id, merchant_id)
        REFERENCES payment_attempts (id, merchant_id),

    -- taxonomy_code and taxonomy_version are set together or not at all.
    -- A classification without a recorded classifier version is unreplayable.
    CONSTRAINT ck_failure_events_taxonomy_paired
        CHECK ((taxonomy_code IS NULL) = (taxonomy_version IS NULL))
);

CREATE INDEX idx_failure_events_rail
    ON failure_events (rail_id, event_timestamp DESC);

CREATE INDEX idx_failure_events_merchant_time
    ON failure_events (merchant_id, event_timestamp DESC);

-- ---- immutability enforcement ---------------------------------------------
-- payment_attempts and failure_events are append-only. "Immutable" written in
-- a comment is a wish; this is the enforcement. Phase 3 updates taxonomy
-- columns on failure_events through a dedicated migration that lifts this
-- restriction for those columns only -- deliberately a schema change that has
-- to be reviewed, not an UPDATE anyone can issue.
CREATE OR REPLACE FUNCTION salvage.reject_mutation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
        'salvage: % on %.% is forbidden; this table is append-only',
        TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_payment_attempts_immutable
    BEFORE UPDATE OR DELETE ON payment_attempts
    FOR EACH ROW EXECUTE FUNCTION salvage.reject_mutation();

CREATE TRIGGER trg_failure_events_immutable
    BEFORE UPDATE OR DELETE ON failure_events
    FOR EACH ROW EXECUTE FUNCTION salvage.reject_mutation();
