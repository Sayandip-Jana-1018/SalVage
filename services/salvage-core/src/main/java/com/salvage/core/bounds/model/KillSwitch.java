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
@Table(name = "kill_switches", schema = "salvage")
public class KillSwitch {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "merchant_id")
    private String merchantId; // NULL = global system kill switch

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false)
    private KillSwitchScope scope;

    @Column(name = "target_id")
    private String targetId;

    @Column(name = "is_active", nullable = false)
    private boolean active;

    @Column(name = "reason", nullable = false)
    private String reason;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected KillSwitch() {
        // JPA constructor
    }

    public KillSwitch(String merchantId, KillSwitchScope scope, String targetId, boolean active, String reason) {
        this.merchantId = merchantId;
        this.scope = Objects.requireNonNull(scope, "scope must not be null");
        this.targetId = targetId;
        this.active = active;
        this.reason = Objects.requireNonNull(reason, "reason must not be null");
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getMerchantId() {
        return merchantId;
    }

    public KillSwitchScope getScope() {
        return scope;
    }

    public String getTargetId() {
        return targetId;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
        this.updatedAt = Instant.now();
    }

    public String getReason() {
        return reason;
    }
}
