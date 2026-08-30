-- V4__provider_operations.sql
-- Phase 9: every call this system makes to a payment provider, recorded.
--
-- One row per attempted money movement, written before the call and settled
-- after it. The row existing with an unresolved outcome is itself the useful
-- signal: it means a call was started and this system does not know how it
-- ended, which is exactly the state a reconciliation sweep must find and
-- resolve.
--
-- Append-only, like the ledger. A money movement that can be edited after the
-- fact is not an audit trail.

CREATE TABLE provider_operations (
    id                      UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id             TEXT        NOT NULL,
    payment_attempt_id      TEXT        NOT NULL,
    provider_name           TEXT        NOT NULL,
    operation               TEXT        NOT NULL
                                        CHECK (operation IN
                                              ('RETRY','PAYMENT_LINK','REFUND','RECONCILE')),

    -- The key sent to the provider. Unique per tenant: this is the constraint
    -- that makes exactly-once real rather than aspirational. A redelivered
    -- command derives the same key and is rejected here even if every layer
    -- of caching above has been cleared.
    idempotency_key         TEXT        NOT NULL,

    provider_payment_id     TEXT,
    provider_refund_id      TEXT,
    provider_link_id        TEXT,

    -- The outcome as the provider reported it. UNKNOWN is a first-class value
    -- and is not a synonym for FAILED; see PaymentState.
    outcome_state           TEXT        NOT NULL
                                        CHECK (outcome_state IN
                                              ('CAPTURED','AUTHORIZED','FAILED','NOT_FOUND','PENDING','REFUNDED','UNKNOWN')),

    -- What we asked the provider to move. Fixed when the row is created and
    -- never rewritten: this is the intent, and an intent that changes after
    -- the fact is not an audit record.
    amount_paise            BIGINT      NOT NULL CHECK (amount_paise >= 0),

    -- What the provider says it actually moved. Null until the call settles,
    -- and null forever on a call whose outcome we never learned.
    --
    -- Separate from amount_paise on purpose. A timed-out call reports no
    -- amount, and writing that zero over the attempted amount would erase the
    -- only record of how much money was at risk -- which is precisely the
    -- figure a reconciliation sweep needs.
    settled_amount_paise    BIGINT      CHECK (settled_amount_paise IS NULL OR settled_amount_paise >= 0),

    provider_error_code     TEXT,

    -- Populated when a reconciliation read resolved an earlier UNKNOWN. Lets
    -- an auditor see not just the final state but that the system did not
    -- know it at the time it acted.
    resolved_from_unknown   BOOLEAN     NOT NULL DEFAULT FALSE,

    raw_response            JSONB       NOT NULL DEFAULT '{}'::jsonb,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at              TIMESTAMPTZ,

    CONSTRAINT pk_provider_operations PRIMARY KEY (id),
    CONSTRAINT uq_provider_operations_idem UNIQUE (merchant_id, idempotency_key),
    CONSTRAINT fk_provider_operations_merchant FOREIGN KEY (merchant_id)
        REFERENCES merchants (merchant_id) ON DELETE RESTRICT
);

CREATE INDEX idx_provider_operations_merchant_attempt
    ON provider_operations (merchant_id, payment_attempt_id, started_at DESC);

-- Finds the rows a reconciliation sweep has to resolve: calls that were made
-- and whose outcome this system never learned.
CREATE INDEX idx_provider_operations_unresolved
    ON provider_operations (merchant_id, started_at)
    WHERE outcome_state = 'UNKNOWN';

-- Settle-once, never rewrite.
--
-- This table cannot use reject_mutation, because a provider operation is
-- written *before* the call and settled after it. That ordering is not
-- optional: a row inserted only on success loses the money movement entirely
-- if the process dies between the gateway taking the money and the commit,
-- which is the one crash that must not lose data.
--
-- So exactly one transition is permitted -- unsettled to settled -- and
-- everything else is refused. An operation may not change merchant, attempt,
-- idempotency key or amount, and a settled row is frozen. The effect is
-- append-only semantics for a row that legitimately has two writes.
CREATE OR REPLACE FUNCTION salvage.reject_provider_operation_rewrite() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'salvage: DELETE on %.% is forbidden; this table is append-only',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD.settled_at IS NOT NULL THEN
        RAISE EXCEPTION
            'salvage: provider_operations row % is already settled and cannot be rewritten',
            OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.merchant_id        IS DISTINCT FROM OLD.merchant_id
    OR NEW.payment_attempt_id IS DISTINCT FROM OLD.payment_attempt_id
    OR NEW.idempotency_key    IS DISTINCT FROM OLD.idempotency_key
    OR NEW.provider_name      IS DISTINCT FROM OLD.provider_name
    OR NEW.operation          IS DISTINCT FROM OLD.operation
    OR NEW.amount_paise       IS DISTINCT FROM OLD.amount_paise
    OR NEW.started_at         IS DISTINCT FROM OLD.started_at THEN
        RAISE EXCEPTION
            'salvage: settling provider_operations row % may not change its identity or amount',
            OLD.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_provider_operations_settle_once
    BEFORE UPDATE OR DELETE ON provider_operations
    FOR EACH ROW EXECUTE FUNCTION salvage.reject_provider_operation_rewrite();
