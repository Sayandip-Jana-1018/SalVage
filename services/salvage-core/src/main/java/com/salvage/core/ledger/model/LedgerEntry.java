package com.salvage.core.ledger.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Immutable entity representing a single cryptographic entry in the append-only ledger.
 *
 * <p>Each entry computes:
 * {@code entry_hash = SHA-256(prev_hash + entry_index + merchant_id + entity_type + entity_id + event_type + payload + created_at)}
 */
@Entity
@Table(name = "ledger_entries", schema = "salvage")
public class LedgerEntry {

    public static final String GENESIS_HASH =
            "0000000000000000000000000000000000000000000000000000000000000000";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "entry_index", nullable = false)
    private Long entryIndex;

    @Column(name = "merchant_id", nullable = false)
    private String merchantId;

    @Column(name = "entity_type", nullable = false)
    private String entityType;

    @Column(name = "entity_id", nullable = false)
    private String entityId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "payload", nullable = false)
    private String payload;

    @Column(name = "prev_hash", nullable = false, length = 64)
    private String prevHash;

    @Column(name = "entry_hash", nullable = false, length = 64)
    private String entryHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected LedgerEntry() {
        // JPA constructor
    }

    public LedgerEntry(
            Long entryIndex,
            String merchantId,
            String entityType,
            String entityId,
            String eventType,
            String payload,
            String prevHash,
            String entryHash,
            Instant createdAt) {
        this.entryIndex = Objects.requireNonNull(entryIndex, "entryIndex must not be null");
        this.merchantId = Objects.requireNonNull(merchantId, "merchantId must not be null");
        this.entityType = Objects.requireNonNull(entityType, "entityType must not be null");
        this.entityId = Objects.requireNonNull(entityId, "entityId must not be null");
        this.eventType = Objects.requireNonNull(eventType, "eventType must not be null");
        this.payload = Objects.requireNonNull(payload, "payload must not be null");
        this.prevHash = Objects.requireNonNull(prevHash, "prevHash must not be null");
        this.entryHash = Objects.requireNonNull(entryHash, "entryHash must not be null");
        this.createdAt = Objects.requireNonNull(createdAt, "createdAt must not be null");
    }

    public UUID getId() {
        return id;
    }

    public Long getEntryIndex() {
        return entryIndex;
    }

    public String getMerchantId() {
        return merchantId;
    }

    public String getEntityType() {
        return entityType;
    }

    public String getEntityId() {
        return entityId;
    }

    public String getEventType() {
        return eventType;
    }

    public String getPayload() {
        return payload;
    }

    public String getPrevHash() {
        return prevHash;
    }

    public String getEntryHash() {
        return entryHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
