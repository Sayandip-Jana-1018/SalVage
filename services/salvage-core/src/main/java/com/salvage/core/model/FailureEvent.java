package com.salvage.core.model;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A failure observed on a payment attempt.
 *
 * <p>Append-only. The database enforces this with
 * {@code trg_failure_events_immutable}; every column is additionally marked
 * {@code updatable = false} so that an accidental dirty-checking update fails
 * in the mapping layer rather than surfacing as a database exception at flush
 * time.
 *
 * <p>{@code taxonomyCode} and {@code taxonomyVersion} are null until Phase 3
 * wires the failure taxonomy. They are deliberately not defaulted: an absent
 * classification and a classification of "unknown" are different facts.
 */
@Entity
@Table(name = "failure_events", schema = "salvage")
public class FailureEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "merchant_id", updatable = false, nullable = false)
    private String merchantId;

    @Column(name = "event_id", updatable = false, nullable = false)
    private UUID eventId;

    @Column(name = "payment_attempt_id", updatable = false, nullable = false)
    private UUID paymentAttemptId;

    @Column(name = "provider_error_code", updatable = false, nullable = false)
    private String providerErrorCode;

    @Column(name = "provider_error_desc", updatable = false)
    private String providerErrorDesc;

    @Column(name = "taxonomy_code", updatable = false)
    private String taxonomyCode;

    @Column(name = "taxonomy_version", updatable = false)
    private String taxonomyVersion;

    @Column(name = "rail_id", updatable = false, nullable = false)
    private String railId;

    @Column(name = "event_timestamp", updatable = false, nullable = false)
    private Instant eventTimestamp;

    @Column(name = "created_at", updatable = false, insertable = false)
    private Instant createdAt;

    protected FailureEvent() {
        // JPA
    }

    public FailureEvent(String merchantId, UUID eventId, UUID paymentAttemptId,
                        String providerErrorCode, String providerErrorDesc,
                        String railId, Instant eventTimestamp) {
        this.merchantId = merchantId;
        this.eventId = eventId;
        this.paymentAttemptId = paymentAttemptId;
        this.providerErrorCode = providerErrorCode;
        this.providerErrorDesc = providerErrorDesc;
        this.railId = railId;
        this.eventTimestamp = eventTimestamp;
    }

    public UUID getId() {
        return id;
    }

    public String getMerchantId() {
        return merchantId;
    }

    public UUID getEventId() {
        return eventId;
    }

    public UUID getPaymentAttemptId() {
        return paymentAttemptId;
    }

    public String getProviderErrorCode() {
        return providerErrorCode;
    }

    public String getProviderErrorDesc() {
        return providerErrorDesc;
    }

    public String getTaxonomyCode() {
        return taxonomyCode;
    }

    public String getTaxonomyVersion() {
        return taxonomyVersion;
    }

    public String getRailId() {
        return railId;
    }

    public Instant getEventTimestamp() {
        return eventTimestamp;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
