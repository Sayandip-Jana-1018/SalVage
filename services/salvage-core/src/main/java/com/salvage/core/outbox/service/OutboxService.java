package com.salvage.core.outbox.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salvage.core.outbox.model.OutboxRecord;
import com.salvage.core.outbox.model.OutboxStatus;
import com.salvage.core.outbox.repository.OutboxRepository;
import java.time.Instant;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service to stage outbound domain events into the transactional outbox table
 * within the calling business transaction.
 */
@Service
public class OutboxService {

    private final OutboxRepository outboxRepository;
    private final ObjectMapper objectMapper;

    public OutboxService(OutboxRepository outboxRepository, ObjectMapper objectMapper) {
        this.outboxRepository = Objects.requireNonNull(outboxRepository, "outboxRepository must not be null");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    /**
     * Commits an outbound event to the outbox table inside an active transaction.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public OutboxRecord stageEvent(
            String merchantId,
            String aggregateType,
            String aggregateId,
            String eventType,
            String topic,
            Object payload) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(aggregateType, "aggregateType must not be null");
        Objects.requireNonNull(aggregateId, "aggregateId must not be null");
        Objects.requireNonNull(eventType, "eventType must not be null");
        Objects.requireNonNull(topic, "topic must not be null");
        Objects.requireNonNull(payload, "payload must not be null");

        String jsonPayload;
        try {
            jsonPayload = (payload instanceof String str) ? str : objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to serialize outbox payload to JSON", e);
        }

        OutboxRecord record = new OutboxRecord(
                merchantId,
                aggregateType,
                aggregateId,
                eventType,
                jsonPayload,
                topic,
                OutboxStatus.PENDING,
                Instant.now());

        return outboxRepository.save(record);
    }
}
