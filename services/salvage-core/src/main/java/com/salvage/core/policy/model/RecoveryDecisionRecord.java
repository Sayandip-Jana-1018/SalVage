package com.salvage.core.policy.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Immutable JPA Entity representing a persistable policy decision and bounds evaluation.
 */
@Entity
@Table(name = "recovery_decisions", schema = "salvage")
public class RecoveryDecisionRecord {

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "merchant_id", nullable = false)
    private String merchantId;

    @Column(name = "payment_attempt_id", nullable = false)
    private String paymentAttemptId;

    @Enumerated(EnumType.STRING)
    @Column(name = "chosen_action", nullable = false)
    private RecoveryActionType chosenAction;

    @Column(name = "recovery_probability", nullable = false, precision = 5, scale = 4)
    private BigDecimal recoveryProbability;

    @Column(name = "expected_net_value_paise", nullable = false)
    private Long expectedNetValuePaise;

    @Column(name = "target_rail_id")
    private String targetRailId;

    @Column(name = "scheduled_delay_seconds")
    private Integer scheduledDelaySeconds;

    @Column(name = "nudge_channel")
    private String nudgeChannel;

    @Column(name = "bounds_evaluation_status", nullable = false)
    private String boundsEvaluationStatus;

    @Column(name = "bounds_rejection_reason")
    private String boundsRejectionReason;

    @Column(name = "saga_id")
    private UUID sagaId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_decision_payload", nullable = false, columnDefinition = "jsonb")
    private String rawDecisionPayload;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected RecoveryDecisionRecord() {
    }

    public RecoveryDecisionRecord(
            UUID id,
            String merchantId,
            String paymentAttemptId,
            RecoveryActionType chosenAction,
            BigDecimal recoveryProbability,
            Long expectedNetValuePaise,
            String targetRailId,
            Integer scheduledDelaySeconds,
            String nudgeChannel,
            String boundsEvaluationStatus,
            String boundsRejectionReason,
            UUID sagaId,
            String rawDecisionPayload,
            Instant createdAt) {
        this.id = id;
        this.merchantId = merchantId;
        this.paymentAttemptId = paymentAttemptId;
        this.chosenAction = chosenAction;
        this.recoveryProbability = recoveryProbability;
        this.expectedNetValuePaise = expectedNetValuePaise;
        this.targetRailId = targetRailId;
        this.scheduledDelaySeconds = scheduledDelaySeconds;
        this.nudgeChannel = nudgeChannel;
        this.boundsEvaluationStatus = boundsEvaluationStatus;
        this.boundsRejectionReason = boundsRejectionReason;
        this.sagaId = sagaId;
        this.rawDecisionPayload = rawDecisionPayload;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public String getMerchantId() {
        return merchantId;
    }

    public String getPaymentAttemptId() {
        return paymentAttemptId;
    }

    public RecoveryActionType getChosenAction() {
        return chosenAction;
    }

    public BigDecimal getRecoveryProbability() {
        return recoveryProbability;
    }

    public Long getExpectedNetValuePaise() {
        return expectedNetValuePaise;
    }

    public String getTargetRailId() {
        return targetRailId;
    }

    public Integer getScheduledDelaySeconds() {
        return scheduledDelaySeconds;
    }

    public String getNudgeChannel() {
        return nudgeChannel;
    }

    public String getBoundsEvaluationStatus() {
        return boundsEvaluationStatus;
    }

    public String getBoundsRejectionReason() {
        return boundsRejectionReason;
    }

    public UUID getSagaId() {
        return sagaId;
    }

    public String getRawDecisionPayload() {
        return rawDecisionPayload;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
