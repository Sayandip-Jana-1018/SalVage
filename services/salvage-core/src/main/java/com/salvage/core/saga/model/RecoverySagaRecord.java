package com.salvage.core.saga.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "recovery_sagas", schema = "salvage")
public class RecoverySagaRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "saga_id", nullable = false)
    private UUID sagaId;

    @Column(name = "merchant_id", nullable = false)
    private String merchantId;

    @Column(name = "payment_attempt_id", nullable = false)
    private String paymentAttemptId;

    @Enumerated(EnumType.STRING)
    @Column(name = "current_state", nullable = false)
    private SagaState currentState;

    @Column(name = "current_step", nullable = false)
    private int currentStep;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false, columnDefinition = "jsonb")
    private String payload;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected RecoverySagaRecord() {
        // JPA constructor
    }

    public RecoverySagaRecord(
            UUID sagaId,
            String merchantId,
            String paymentAttemptId,
            SagaState currentState,
            int currentStep,
            String payload,
            Instant createdAt,
            Instant updatedAt) {
        this.sagaId = Objects.requireNonNull(sagaId, "sagaId must not be null");
        this.merchantId = Objects.requireNonNull(merchantId, "merchantId must not be null");
        this.paymentAttemptId = Objects.requireNonNull(paymentAttemptId, "paymentAttemptId must not be null");
        this.currentState = Objects.requireNonNull(currentState, "currentState must not be null");
        this.currentStep = currentStep;
        this.payload = Objects.requireNonNull(payload, "payload must not be null");
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt must not be null");
        this.updatedAt = Objects.requireNonNull(updatedAt, "updatedAt must not be null");
    }

    public UUID getId() {
        return id;
    }

    public UUID getSagaId() {
        return sagaId;
    }

    public String getMerchantId() {
        return merchantId;
    }

    public String getPaymentAttemptId() {
        return paymentAttemptId;
    }

    public SagaState getCurrentState() {
        return currentState;
    }

    public void setCurrentState(SagaState currentState) {
        this.currentState = Objects.requireNonNull(currentState, "currentState must not be null");
        this.updatedAt = Instant.now();
    }

    public int getCurrentStep() {
        return currentStep;
    }

    public void setCurrentStep(int currentStep) {
        this.currentStep = currentStep;
        this.updatedAt = Instant.now();
    }

    public String getPayload() {
        return payload;
    }

    public void setPayload(String payload) {
        this.payload = Objects.requireNonNull(payload, "payload must not be null");
        this.updatedAt = Instant.now();
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
