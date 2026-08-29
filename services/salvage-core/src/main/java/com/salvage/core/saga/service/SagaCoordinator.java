package com.salvage.core.saga.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salvage.core.ledger.service.LedgerService;
import com.salvage.core.outbox.service.OutboxService;
import com.salvage.core.saga.model.RecoverySagaRecord;
import com.salvage.core.saga.model.SagaState;
import com.salvage.core.saga.repository.RecoverySagaRepository;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Saga Coordinator: Manages multi-step payment recovery workflows with persistent state transitions,
 * compensation paths, ledger recording, and transactional outbox event publishing.
 */
@Service
public class SagaCoordinator {

    private static final Logger log = LoggerFactory.getLogger(SagaCoordinator.class);

    private final RecoverySagaRepository sagaRepository;
    private final LedgerService ledgerService;
    private final OutboxService outboxService;
    private final ObjectMapper objectMapper;

    public SagaCoordinator(
            RecoverySagaRepository sagaRepository,
            LedgerService ledgerService,
            OutboxService outboxService,
            ObjectMapper objectMapper) {
        this.sagaRepository = Objects.requireNonNull(sagaRepository, "sagaRepository must not be null");
        this.ledgerService = Objects.requireNonNull(ledgerService, "ledgerService must not be null");
        this.outboxService = Objects.requireNonNull(outboxService, "outboxService must not be null");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    /**
     * Starts a new recovery saga for a payment attempt.
     */
    @Transactional
    public RecoverySagaRecord startSaga(String merchantId, String paymentAttemptId, Map<String, Object> initialContext) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(paymentAttemptId, "paymentAttemptId must not be null");

        UUID sagaId = UUID.randomUUID();
        String jsonPayload;
        try {
            jsonPayload = objectMapper.writeValueAsString(initialContext);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to serialize saga context", e);
        }

        Instant now = Instant.now();
        RecoverySagaRecord saga = new RecoverySagaRecord(
                sagaId,
                merchantId,
                paymentAttemptId,
                SagaState.STARTED,
                0,
                jsonPayload,
                now,
                now);

        RecoverySagaRecord saved = sagaRepository.save(saga);

        // Record in ledger
        ledgerService.append(
                merchantId,
                "RECOVERY_SAGA",
                sagaId.toString(),
                "SAGA_STARTED",
                jsonPayload);

        // Stage outbox event
        outboxService.stageEvent(
                merchantId,
                "RECOVERY_SAGA",
                sagaId.toString(),
                "salvage.saga.started",
                "salvage.events.saga",
                jsonPayload);

        log.info("Started recovery saga {} for attempt {} (merchant {})",
                sagaId, paymentAttemptId, merchantId);

        return saved;
    }

    /**
     * Transitions a saga to a new state and step atomically.
     */
    @Transactional
    public RecoverySagaRecord transitionStep(
            String merchantId,
            UUID sagaId,
            SagaState targetState,
            Map<String, Object> stepOutput) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(sagaId, "sagaId must not be null");
        Objects.requireNonNull(targetState, "targetState must not be null");

        RecoverySagaRecord saga = sagaRepository.findByMerchantIdAndSagaId(merchantId, sagaId)
                .orElseThrow(() -> new IllegalArgumentException("Saga not found for id: " + sagaId));

        String jsonPayload;
        try {
            jsonPayload = (stepOutput != null) ? objectMapper.writeValueAsString(stepOutput) : saga.getPayload();
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Failed to serialize saga step output", e);
        }

        saga.setCurrentState(targetState);
        saga.setCurrentStep(saga.getCurrentStep() + 1);
        saga.setPayload(jsonPayload);

        RecoverySagaRecord updated = sagaRepository.save(saga);

        // Append to ledger
        ledgerService.append(
                merchantId,
                "RECOVERY_SAGA",
                sagaId.toString(),
                "SAGA_STEP_" + targetState.name(),
                jsonPayload);

        // Stage outbox event
        outboxService.stageEvent(
                merchantId,
                "RECOVERY_SAGA",
                sagaId.toString(),
                "salvage.saga." + targetState.name().toLowerCase(),
                "salvage.events.saga",
                jsonPayload);

        log.info("Transitioned saga {} to state {} (step {})",
                sagaId, targetState, saga.getCurrentStep());

        return updated;
    }
}
