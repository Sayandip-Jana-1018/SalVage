package com.salvage.core.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Multi-tenant root entity. Every query in the system is scoped by
 * {@code merchantId}, enforced at the repository layer.
 */
@Entity
@Table(name = "merchants", schema = "salvage")
public class Merchant {

    @Id
    @Column(name = "merchant_id", nullable = false)
    private String merchantId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "active", nullable = false)
    private boolean active;

    protected Merchant() {
        // JPA
    }

    public Merchant(String merchantId, String name) {
        this.merchantId = merchantId;
        this.name = name;
        this.createdAt = Instant.now();
        this.active = true;
    }

    public String getMerchantId() { return merchantId; }
    public String getName() { return name; }
    public Instant getCreatedAt() { return createdAt; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
