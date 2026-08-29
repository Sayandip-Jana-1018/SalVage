package com.salvage.core.bounds.model;

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

@Entity
@Table(name = "opt_outs", schema = "salvage")
public class OptOut {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "merchant_id", nullable = false)
    private String merchantId;

    @Column(name = "customer_id", nullable = false)
    private String customerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "channel", nullable = false)
    private Channel channel;

    @Column(name = "reason")
    private String reason;

    @Column(name = "opted_out_at", nullable = false)
    private Instant optedOutAt;

    protected OptOut() {
        // JPA constructor
    }

    public OptOut(String merchantId, String customerId, Channel channel, String reason, Instant optedOutAt) {
        this.merchantId = Objects.requireNonNull(merchantId, "merchantId must not be null");
        this.customerId = Objects.requireNonNull(customerId, "customerId must not be null");
        this.channel = Objects.requireNonNull(channel, "channel must not be null");
        this.reason = reason;
        this.optedOutAt = Objects.requireNonNull(optedOutAt, "optedOutAt must not be null");
    }

    public UUID getId() {
        return id;
    }

    public String getMerchantId() {
        return merchantId;
    }

    public String getCustomerId() {
        return customerId;
    }

    public Channel getChannel() {
        return channel;
    }

    public String getReason() {
        return reason;
    }

    public Instant getOptedOutAt() {
        return optedOutAt;
    }
}
