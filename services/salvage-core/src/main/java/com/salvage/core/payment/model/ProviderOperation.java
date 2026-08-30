package com.salvage.core.payment.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * One call this system made, or is making, to a payment provider.
 *
 * <p>Written before the call and settled after it. A row with a null
 * {@code settledAt} means a gateway call was started and this system never
 * learned how it ended -- which is the state a reconciliation sweep exists to
 * find. Writing only on success would lose the money movement entirely if the
 * process died between the provider taking the money and the commit.
 *
 * <p>The database permits exactly one transition, unsettled to settled, and
 * refuses any change to identity or amount. See {@code V4__provider_operations.sql}.
 */
@Entity
@Table(name = "provider_operations", schema = "salvage")
public class ProviderOperation {

    public enum Operation {
        RETRY,
        PAYMENT_LINK,
        REFUND,
        RECONCILE
    }

    @Id
    @Column(name = "id", nullable = false)
    private UUID id;

    @Column(name = "merchant_id", nullable = false)
    private String merchantId;

    @Column(name = "payment_attempt_id", nullable = false)
    private String paymentAttemptId;

    @Column(name = "provider_name", nullable = false)
    private String providerName;

    @Enumerated(EnumType.STRING)
    @Column(name = "operation", nullable = false)
    private Operation operation;

    @Column(name = "idempotency_key", nullable = false)
    private String idempotencyKey;

    @Column(name = "provider_payment_id")
    private String providerPaymentId;

    @Column(name = "provider_refund_id")
    private String providerRefundId;

    @Column(name = "provider_link_id")
    private String providerLinkId;

    @Enumerated(EnumType.STRING)
    @Column(name = "outcome_state", nullable = false)
    private PaymentState outcomeState;

    @Column(name = "amount_paise", nullable = false)
    private Long amountPaise;

    @Column(name = "settled_amount_paise")
    private Long settledAmountPaise;

    @Column(name = "provider_error_code")
    private String providerErrorCode;

    @Column(name = "resolved_from_unknown", nullable = false)
    private Boolean resolvedFromUnknown;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_response", nullable = false)
    private String rawResponse;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "settled_at")
    private Instant settledAt;

    protected ProviderOperation() {
        // JPA
    }

    public ProviderOperation(
            UUID id,
            String merchantId,
            String paymentAttemptId,
            String providerName,
            Operation operation,
            String idempotencyKey,
            long amountPaise,
            Instant startedAt) {
        this.id = id;
        this.merchantId = merchantId;
        this.paymentAttemptId = paymentAttemptId;
        this.providerName = providerName;
        this.operation = operation;
        this.idempotencyKey = idempotencyKey;
        this.amountPaise = amountPaise;
        this.startedAt = startedAt;
        // Starts UNKNOWN because until the call returns, that is the truth.
        this.outcomeState = PaymentState.UNKNOWN;
        this.resolvedFromUnknown = false;
        this.rawResponse = "{}";
    }

    /**
     * Record what the provider said. Permitted exactly once.
     *
     * <p>{@code amountPaise} -- what we asked for -- is deliberately not a
     * parameter. It is fixed at creation and the database refuses to change
     * it. A timed-out call reports no amount, and letting that zero overwrite
     * the attempted amount would erase the record of how much was at risk,
     * which is the one figure a reconciliation sweep needs.
     */
    public void settle(
            PaymentState state,
            String providerPaymentId,
            String providerErrorCode,
            Long settledAmountPaise,
            String rawResponse,
            Instant settledAt) {
        this.outcomeState = state;
        this.providerPaymentId = providerPaymentId;
        this.providerErrorCode = providerErrorCode;
        this.settledAmountPaise = settledAmountPaise;
        this.rawResponse = rawResponse == null ? "{}" : rawResponse;
        this.settledAt = settledAt;
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

    public String getProviderName() {
        return providerName;
    }

    public Operation getOperation() {
        return operation;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }

    public String getProviderPaymentId() {
        return providerPaymentId;
    }

    public void setProviderPaymentId(String providerPaymentId) {
        this.providerPaymentId = providerPaymentId;
    }

    public String getProviderRefundId() {
        return providerRefundId;
    }

    public void setProviderRefundId(String providerRefundId) {
        this.providerRefundId = providerRefundId;
    }

    public String getProviderLinkId() {
        return providerLinkId;
    }

    public void setProviderLinkId(String providerLinkId) {
        this.providerLinkId = providerLinkId;
    }

    public PaymentState getOutcomeState() {
        return outcomeState;
    }

    public Long getAmountPaise() {
        return amountPaise;
    }

    /** What the provider confirmed it moved, or null if it never told us. */
    public Long getSettledAmountPaise() {
        return settledAmountPaise;
    }

    public String getProviderErrorCode() {
        return providerErrorCode;
    }

    public Boolean getResolvedFromUnknown() {
        return resolvedFromUnknown;
    }

    public void setResolvedFromUnknown(Boolean resolvedFromUnknown) {
        this.resolvedFromUnknown = resolvedFromUnknown;
    }

    public String getRawResponse() {
        return rawResponse;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public Instant getSettledAt() {
        return settledAt;
    }
}
