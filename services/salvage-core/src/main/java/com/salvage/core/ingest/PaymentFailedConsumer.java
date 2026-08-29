package com.salvage.core.ingest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;

import com.salvage.core.contract.EventContractValidator;
import com.salvage.core.contract.EventContractViolationException;
import com.salvage.core.contract.PaymentFailedEvent;

/**
 * Consumes {@code salvage.payment-failed.v1}.
 *
 * <p>Every payload is validated against the published JSON Schema before any
 * business logic sees it (ADR-0002), then handed to
 * {@link PaymentIngestService} which writes it transactionally.
 *
 * <p><strong>Error handling, stated plainly.</strong> There is no dead-letter
 * topic yet -- that belongs to Phase 2 alongside the outbox and the retry
 * topology. Until then:
 *
 * <ul>
 *   <li>A payload that violates the contract, or names an unprovisioned
 *       merchant, is <em>logged at ERROR and acknowledged</em>. It is dropped.
 *       Both conditions are deterministic: redelivery would fail identically,
 *       so blocking the partition on infinite retry would take the consumer
 *       down without saving the message.</li>
 *   <li>Anything else -- a database outage, a transient failure -- is
 *       <em>not</em> acknowledged and propagates, so the container redelivers
 *       rather than losing the event.</li>
 * </ul>
 *
 * <p>Dropping a poison message is acceptable at Phase 0 only because nothing
 * downstream depends on it yet and the drop is loud. It is not acceptable
 * once money moves, which is why the DLQ is a Phase 2 deliverable rather than
 * an optional improvement.
 */
@Component
public class PaymentFailedConsumer {

    public static final String TOPIC = "salvage.payment-failed.v1";

    private static final Logger log = LoggerFactory.getLogger(PaymentFailedConsumer.class);

    private final EventContractValidator validator;
    private final PaymentIngestService ingestService;

    public PaymentFailedConsumer(EventContractValidator validator,
                                 PaymentIngestService ingestService) {
        this.validator = validator;
        this.ingestService = ingestService;
    }

    @KafkaListener(topics = TOPIC, groupId = "salvage-core-ingest")
    public void onMessage(@Payload String payload,
                          @Header(name = KafkaHeaders.RECEIVED_KEY, required = false) String key,
                          @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
                          @Header(KafkaHeaders.OFFSET) long offset,
                          Acknowledgment ack) {
        PaymentFailedEvent event;
        try {
            event = validator.parsePaymentFailed(payload);
        } catch (EventContractViolationException e) {
            log.error("Dropping contract-violating message at partition={} offset={} key={}: {}",
                    partition, offset, key, e.getMessage());
            ack.acknowledge();
            return;
        }

        try {
            IngestResult result = ingestService.ingest(event);
            if (result.duplicate()) {
                log.info("Duplicate event_id={} ignored (attempt={})",
                        event.eventId(), result.paymentAttemptId());
            } else {
                log.info("Ingested event_id={} attempt={} rail={}",
                        event.eventId(), result.paymentAttemptId(), event.railId());
            }
            ack.acknowledge();
        } catch (UnknownMerchantException e) {
            log.error("Dropping message for unprovisioned merchant at partition={} offset={}: {}",
                    partition, offset, e.getMessage());
            ack.acknowledge();
        }
        // Any other exception is intentionally left to propagate: it is
        // presumed transient and the event must not be lost.
    }
}
