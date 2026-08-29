package com.salvage.core.bounds.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "contact_budgets", schema = "salvage")
public class ContactBudget {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "merchant_id", nullable = false)
    private String merchantId;

    @Column(name = "customer_id", nullable = false)
    private String customerId;

    @Column(name = "window_start", nullable = false)
    private Instant windowStart;

    @Column(name = "window_end", nullable = false)
    private Instant windowEnd;

    @Column(name = "max_allowance", nullable = false)
    private int maxAllowance;

    @Column(name = "consumed_count", nullable = false)
    private int consumedCount;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ContactBudget() {
        // JPA constructor
    }

    public ContactBudget(
            String merchantId,
            String customerId,
            Instant windowStart,
            Instant windowEnd,
            int maxAllowance,
            int consumedCount,
            Instant createdAt,
            Instant updatedAt) {
        this.merchantId = Objects.requireNonNull(merchantId, "merchantId must not be null");
        this.customerId = Objects.requireNonNull(customerId, "customerId must not be null");
        this.windowStart = Objects.requireNonNull(windowStart, "windowStart must not be null");
        this.windowEnd = Objects.requireNonNull(windowEnd, "windowEnd must not be null");
        this.maxAllowance = maxAllowance;
        this.consumedCount = consumedCount;
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt must not be null");
        this.updatedAt = Objects.requireNonNull(updatedAt, "updatedAt must not be null");
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

    public Instant getWindowStart() {
        return windowStart;
    }

    public Instant getWindowEnd() {
        return windowEnd;
    }

    public int getMaxAllowance() {
        return maxAllowance;
    }

    public int getConsumedCount() {
        return consumedCount;
    }

    public boolean hasRemainingAllowance() {
        return consumedCount < maxAllowance;
    }

    public void incrementConsumed() {
        if (consumedCount >= maxAllowance) {
            throw new IllegalStateException("Contact budget allowance exceeded");
        }
        this.consumedCount++;
        this.updatedAt = Instant.now();
    }
}
