package com.salvage.core.ingest;

import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.salvage.core.contract.PaymentFailedEvent;
import com.salvage.core.model.FailureEvent;
import com.salvage.core.model.PaymentAttempt;
import com.salvage.core.repository.FailureEventRepository;
import com.salvage.core.repository.MerchantRepository;
import com.salvage.core.repository.PaymentAttemptRepository;

/**
 * Writes an observed payment failure into the attempt and failure-event
 * tables.
 *
 * <p><strong>Scope.</strong> This is event-level deduplication, not the
 * idempotency system described in ADR-0004. It guarantees that redelivering
 * the same {@code event_id} does not produce a second row. It says nothing
 * about money movement, which does not exist until Phase 2 and which needs
 * the idempotency-key table, the outbox, and the reconciler.
 *
 * <p>Deduplication is enforced by the database, not by the read that precedes
 * it. The {@code findBy...} check is a fast path; the authority is the unique
 * constraint on {@code (merchant_id, event_id)}. Two workers racing on the
 * same event both pass the read, one insert wins, and the loser sees a
 * constraint violation which is treated as "already ingested". A check-then-act
 * without the constraint would be a race with a wide window.
 */
@Service
public class PaymentIngestService {

    private static final Logger log = LoggerFactory.getLogger(PaymentIngestService.class);

    private final MerchantRepository merchants;
    private final PaymentAttemptRepository attempts;
    private final FailureEventRepository failures;
    private final ObjectMapper objectMapper;

    public PaymentIngestService(MerchantRepository merchants,
                                PaymentAttemptRepository attempts,
                                FailureEventRepository failures,
                                ObjectMapper objectMapper) {
        this.merchants = merchants;
        this.attempts = attempts;
        this.failures = failures;
        this.objectMapper = objectMapper;
    }

    /**
     * @return the outcome, so the caller can distinguish a first ingest from a
     *     redelivery without inspecting the database again
     */
    @Transactional
    public IngestResult ingest(PaymentFailedEvent event) {
        if (!merchants.existsByMerchantId(event.merchantId())) {
            // Fail closed. Auto-provisioning a tenant from an inbound event
            // would let anyone who can publish to the topic create tenants.
            throw new UnknownMerchantException(event.merchantId());
        }

        Optional<FailureEvent> existing =
                failures.findByMerchantIdAndEventId(event.merchantId(), event.eventId());
        if (existing.isPresent()) {
            return IngestResult.duplicate(existing.get().getPaymentAttemptId());
        }

        PaymentAttempt attempt = attempts
                .findByMerchantIdAndPaymentAttemptId(event.merchantId(), event.paymentAttemptId())
                .orElseGet(() -> attempts.save(toAttempt(event)));

        FailureEvent failure = new FailureEvent(
                event.merchantId(),
                event.eventId(),
                attempt.getId(),
                event.providerErrorCode(),
                event.providerErrorDescription(),
                event.railId(),
                event.eventTimestamp());

        try {
            failures.save(failure);
        } catch (DataIntegrityViolationException e) {
            // Another worker inserted the same event between our read and our
            // write. That is the constraint doing its job, not an error.
            log.debug("Concurrent ingest of event_id={} lost the race; treating as duplicate",
                    event.eventId());
            return IngestResult.duplicate(attempt.getId());
        }

        return IngestResult.ingested(attempt.getId());
    }

    private PaymentAttempt toAttempt(PaymentFailedEvent event) {
        return new PaymentAttempt(
                event.merchantId(),
                event.orderId(),
                event.paymentAttemptId(),
                event.amountPaise(),
                event.currency(),
                event.paymentMethod(),
                event.provider(),
                event.issuer(),
                event.customerId(),
                event.recurring(),
                event.mandateId(),
                serialise(event));
    }

    /**
     * The raw event is stored verbatim so that a decision made from it can be
     * replayed from exactly the bytes that produced it, rather than from a
     * projection that a later schema change might have reshaped.
     */
    private String serialise(PaymentFailedEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(
                    "Failed to serialise a PaymentFailedEvent that was already parsed from JSON", e);
        }
    }
}
