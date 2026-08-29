package com.salvage.core.outbox.publisher;

import com.salvage.core.outbox.model.OutboxRecord;
import com.salvage.core.outbox.model.OutboxStatus;
import com.salvage.core.outbox.repository.OutboxRepository;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Scheduled worker that reads pending outbox events using SKIP LOCKED
 * and publishes them to Kafka with at-least-once delivery semantics.
 */
@Component
public class OutboxPublisher {

    private static final Logger log = LoggerFactory.getLogger(OutboxPublisher.class);
    private static final int BATCH_SIZE = 50;
    private static final int MAX_RETRIES = 10;

    private final OutboxRepository outboxRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;

    public OutboxPublisher(
            OutboxRepository outboxRepository,
            KafkaTemplate<String, String> kafkaTemplate) {
        this.outboxRepository = Objects.requireNonNull(outboxRepository, "outboxRepository must not be null");
        this.kafkaTemplate = Objects.requireNonNull(kafkaTemplate, "kafkaTemplate must not be null");
    }

    /**
     * Polls pending outbox records and publishes to Kafka.
     * Returns the count of successfully published events.
     */
    @Scheduled(fixedDelayString = "${salvage.outbox.poll-interval-ms:500}")
    @Transactional
    public int publishPendingEvents() {
        List<OutboxRecord> pending = outboxRepository.findPendingEventsForPublishing(BATCH_SIZE);
        if (pending.isEmpty()) {
            return 0;
        }

        int publishedCount = 0;
        for (OutboxRecord record : pending) {
            try {
                // Key by aggregateId (e.g. payment_attempt_id) to preserve partition order
                kafkaTemplate.send(
                        Objects.requireNonNull(record.getTopic()),
                        Objects.requireNonNull(record.getAggregateId()),
                        Objects.requireNonNull(record.getPayload())).get();
                record.markPublished(Instant.now());
                outboxRepository.save(record);
                publishedCount++;
                log.debug("Successfully published outbox event {} to topic {}", record.getId(), record.getTopic());
            } catch (Exception e) {
                record.incrementRetryCount();
                log.warn("Failed to publish outbox event {} (retry {}): {}",
                        record.getId(), record.getRetryCount(), e.getMessage());
                if (record.getRetryCount() >= MAX_RETRIES) {
                    log.error("Outbox event {} exceeded max retries, marking FAILED", record.getId());
                    record.setStatus(OutboxStatus.FAILED);
                }
                outboxRepository.save(record);
            }
        }

        return publishedCount;
    }
}
