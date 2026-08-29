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
 * One row per payment attempt. Immutable once written.
 */
@Entity
@Table(name = "payment_attempts", schema = "salvage")
public class PaymentAttempt {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "merchant_id", nullable = false)
    private String merchantId;

    @Column(name = "order_id", nullable = false)
    private String orderId;

    @Column(name = "payment_attempt_id", nullable = false)
    private String paymentAttemptId;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(name = "currency", nullable = false)
    private String currency;

    @Column(name = "payment_method", nullable = false)
    private String paymentMethod;

    @Column(name = "provider", nullable = false)
    private String provider;

    @Column(name = "issuer", nullable = false)
    private String issuer;

    @Column(name = "customer_id")
    private String customerId;

    @Column(name = "is_recurring", nullable = false)
    private boolean recurring;

    @Column(name = "mandate_id")
    private String mandateId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "raw_event", nullable = false, columnDefinition = "jsonb")
    private String rawEvent;

    @Column(name = "created_at", nullable = false, updatable = false)
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
        this.createdAt = Instant.now();
    }

    // Getters
    public UUID getId() { return id; }
    public String getMerchantId() { return merchantId; }
    public String getOrderId() { return orderId; }
    public String getPaymentAttemptId() { return paymentAttemptId; }
    public long getAmountPaise() { return amountPaise; }
    public String getCurrency() { return currency; }
    public String getPaymentMethod() { return paymentMethod; }
    public String getProvider() { return provider; }
    public String getIssuer() { return issuer; }
    public String getCustomerId() { return customerId; }
    public boolean isRecurring() { return recurring; }
    public String getMandateId() { return mandateId; }
    public String getRawEvent() { return rawEvent; }
    public Instant getCreatedAt() { return createdAt; }
}
