-- V3__recovery_decisions.sql
-- Flyway migration for Phase 4: Recoverability & Policy Engine decision persistence.

CREATE TABLE recovery_decisions (
    id                          UUID        NOT NULL DEFAULT gen_random_uuid(),
    merchant_id                 TEXT        NOT NULL,
    payment_attempt_id          TEXT        NOT NULL,
    chosen_action               TEXT        NOT NULL
                                            CHECK (chosen_action IN
                                                  ('RETRY_IMMEDIATE','RETRY_SCHEDULED','SWITCH_RAIL','CUSTOMER_NUDGE','NO_ACTION')),
    recovery_probability        NUMERIC(5, 4) NOT NULL
                                            CHECK (recovery_probability >= 0.0 AND recovery_probability <= 1.0),
    expected_net_value_paise    BIGINT      NOT NULL,
    target_rail_id              TEXT,
    scheduled_delay_seconds     INT,
    nudge_channel               TEXT        CHECK (nudge_channel IS NULL OR nudge_channel IN ('WHATSAPP','SMS','EMAIL')),
    bounds_evaluation_status    TEXT        NOT NULL
                                            CHECK (bounds_evaluation_status IN ('PERMITTED','REJECTED','BYPASSED')),
    bounds_rejection_reason     TEXT,
    saga_id                     UUID,
    raw_decision_payload        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_recovery_decisions PRIMARY KEY (id),
    CONSTRAINT fk_recovery_decisions_merchant FOREIGN KEY (merchant_id)
        REFERENCES merchants (merchant_id) ON DELETE RESTRICT,
    CONSTRAINT fk_recovery_decisions_saga FOREIGN KEY (saga_id)
        REFERENCES recovery_sagas (id) ON DELETE SET NULL
);

CREATE INDEX idx_recovery_decisions_merchant_attempt
    ON recovery_decisions (merchant_id, payment_attempt_id, created_at DESC);

-- Decisions are tamper-evident and append-only
CREATE TRIGGER trg_recovery_decisions_immutable
    BEFORE UPDATE OR DELETE ON recovery_decisions
    FOR EACH ROW EXECUTE FUNCTION reject_mutation();
