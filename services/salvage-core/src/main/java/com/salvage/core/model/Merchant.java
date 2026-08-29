package com.salvage.core.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Multi-tenant root entity. Every query in the system is scoped by
 * {@code merchantId}; see the repository interfaces, which expose no unscoped
 * read.
 *
 * <p>Unlike {@code PaymentAttempt} and {@code FailureEvent}, this row is
 * mutable -- a merchant can be deactivated. It is reference data, not a
 * recorded fact.
 */
@Entity
@Table(name = "merchants", schema = "salvage")
public class Merchant {

    @Id
    @Column(name = "merchant_id", updatable = false, nullable = false)
    private String merchantId;

    @Column(name = "name", nullable = false)
    private String name;

    /**
     * Populated by the column default. The database clock is the single source
     * of time for stored facts; an application-set timestamp makes row
     * ordering depend on which host wrote the row.
     */
    @Column(name = "created_at", updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "active", nullable = false)
    private boolean active;

    protected Merchant() {
        // JPA
    }

    public Merchant(String merchantId, String name) {
        this.merchantId = merchantId;
        this.name = name;
        this.active = true;
    }

    public String getMerchantId() { return merchantId; }
    public String getName() { return name; }
    public Instant getCreatedAt() { return createdAt; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
