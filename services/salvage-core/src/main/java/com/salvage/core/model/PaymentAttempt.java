package com.salvage.core.model;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * One row per payment attempt.
 *
 * <p>Append-only. The database enforces this with
 * {@code trg_payment_attempts_immutable}; every column is additionally marked
 * {@code updatable = false} so that an accidental dirty-checking update is
 * caught in the mapping layer.
 *
 * <p>{@code createdAt} is {@code insertable = false} and populated by the
 * column default. The database clock is the single source of time for stored
 * facts: an application-set timestamp would make row ordering depend on which
 * host wrote the row, and clock skew between hosts is one of the failure modes
 * the Phase 2 chaos suite injects deliberately.
 */
@Entity
@Table(name = "payment_attempts", schema = "salvage")
public class PaymentAttempt {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "merchant_id", updatable = false, nullable = false)
    private String merchantId;

    @Column(name = "order_id", updatable = false, nullable = false)
    private String orderId;

    @Column(name = "payment_attempt_id", updatable = false, nullable = false)
    private String paymentAttemptId;

    @Column(name = "amount_paise", updatable = false, nullable = false)
    private long amountPaise;

    @Column(name = "currency", updatable = false, nullable = false)
    private String currency;

    @Column(name = "payment_method", updatable = false, nullable = false)
    private String paymentMethod;

    @Column(name = "provider", updatable = false, nullable = false)
    private String provider;

    @Column(name = "issuer", updatable = false, nullable = false)
    private String issuer;

    @Column(name = "customer_id", updatable = false)
    private String customerId;

    @Column(name = "is_recurring", updatable = false, nullable = false)
    private boolean recurring;

    @Column(name = "mandate_id", updatable = false)
    private String mandateId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_event", updatable = false, nullable = false, columnDefinition = "jsonb")
    private String rawEvent;

    @Column(name = "created_at", updatable = false, insertable = false)
    private Instant createdAt;

    protected PaymentAttempt() {
        // JPA
    }

    public PaymentAttempt(String merchantId, String orderId,
                          String paymentAttemptId, long amountPaise,
                          String currency, String paymentMethod,
                          String provider, String issuer,
                          String customerId, boolean recurring,
                          String mandateId, String rawEvent) {
        this.merchantId = merchantId;
        this.orderId = orderId;
        this.paymentAttemptId = paymentAttemptId;
        this.amountPaise = amountPaise;
        this.currency = currency;
        this.paymentMethod = paymentMethod;
        this.provider = provider;
        this.issuer = issuer;
        this.customerId = customerId;
        this.recurring = recurring;
        this.mandateId = mandateId;
        this.rawEvent = rawEvent;
    }

    public UUID getId() {
        return id;
    }

    public String getMerchantId() {
        return merchantId;
    }

    public String getOrderId() {
        return orderId;
    }

    public String getPaymentAttemptId() {
        return paymentAttemptId;
    }

    public long getAmountPaise() {
        return amountPaise;
    }

    public String getCurrency() {
        return currency;
    }

    public String getPaymentMethod() {
        return paymentMethod;
    }

    public String getProvider() {
        return provider;
    }

    public String getIssuer() {
        return issuer;
    }

    public String getCustomerId() {
        return customerId;
    }

    public boolean isRecurring() {
        return recurring;
    }

    public String getMandateId() {
        return mandateId;
    }

    public String getRawEvent() {
        return rawEvent;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
