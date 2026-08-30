package com.salvage.core.policy.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salvage.core.bounds.model.ActionType;
import com.salvage.core.bounds.model.BoundsContext;
import com.salvage.core.bounds.model.BoundsEvaluationResult;
import com.salvage.core.bounds.model.Channel;
import com.salvage.core.bounds.service.BoundsEngine;
import com.salvage.core.ledger.service.LedgerService;
import com.salvage.core.lock.DistributedLockManager;
import com.salvage.core.model.PaymentAttempt;
import com.salvage.core.payment.service.RecoveryEffector;
import com.salvage.core.policy.client.BrainClient;
import com.salvage.core.policy.model.PolicyDecisionResponse;
import com.salvage.core.policy.model.RecoveryActionType;
import com.salvage.core.policy.model.RecoveryDecisionRecord;
import com.salvage.core.policy.repository.RecoveryDecisionRepository;
import com.salvage.core.repository.PaymentAttemptRepository;
import com.salvage.core.saga.model.RecoverySagaRecord;
import com.salvage.core.saga.model.SagaState;
import com.salvage.core.saga.service.SagaCoordinator;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Orchestrates recovery decision retrieval from salvage-brain, evaluates hard bounds,
 * acquires distributed concurrency locks, and executes sagas with immutable ledger records.
 */
@Service
public class RecoveryPolicyExecutor {

    private static final Logger log = LoggerFactory.getLogger(RecoveryPolicyExecutor.class);

    private final BrainClient brainClient;
    private final BoundsEngine boundsEngine;
    private final DistributedLockManager lockManager;
    private final SagaCoordinator sagaCoordinator;
    private final LedgerService ledgerService;
    private final RecoveryDecisionRepository decisionRepository;
    private final RecoveryEffector effector;
    private final PaymentAttemptRepository attemptRepository;
    private final ObjectMapper objectMapper;

    public RecoveryPolicyExecutor(
            BrainClient brainClient,
            BoundsEngine boundsEngine,
            DistributedLockManager lockManager,
            SagaCoordinator sagaCoordinator,
            LedgerService ledgerService,
            RecoveryDecisionRepository decisionRepository,
            RecoveryEffector effector,
            PaymentAttemptRepository attemptRepository,
            ObjectMapper objectMapper) {
        this.brainClient = Objects.requireNonNull(brainClient, "brainClient must not be null");
        this.boundsEngine = Objects.requireNonNull(boundsEngine, "boundsEngine must not be null");
        this.lockManager = Objects.requireNonNull(lockManager, "lockManager must not be null");
        this.sagaCoordinator = Objects.requireNonNull(sagaCoordinator, "sagaCoordinator must not be null");
        this.ledgerService = Objects.requireNonNull(ledgerService, "ledgerService must not be null");
        this.decisionRepository = Objects.requireNonNull(decisionRepository, "decisionRepository must not be null");
        this.effector = Objects.requireNonNull(effector, "effector must not be null");
        this.attemptRepository = Objects.requireNonNull(attemptRepository, "attemptRepository must not be null");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    /**
     * Executes the end-to-end recovery policy lifecycle for a payment attempt.
     */
    @Transactional
    public RecoveryDecisionRecord processRecoveryDecision(
            String merchantId,
            String paymentAttemptId,
            String customerId,
            int attemptCount,
            String currentRailId,
            ZoneId customerTimezone) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(paymentAttemptId, "paymentAttemptId must not be null");

        // 1. Get intelligence decision from salvage-brain
        PolicyDecisionResponse decision = brainClient.decide(merchantId, paymentAttemptId);

        // 2. Map decision to Bounds Engine context
        ActionType coreAction = mapToCoreActionType(decision.chosenAction());
        Channel coreChannel = mapToCoreChannel(decision.nudgeChannel());
        String targetRail = decision.targetRailId() != null ? decision.targetRailId() : currentRailId;
        Instant now = Instant.now();
        ZoneId zone = customerTimezone != null ? customerTimezone : ZoneId.of("Asia/Kolkata");

        BoundsContext boundsContext = new BoundsContext(
                merchantId,
                customerId,
                paymentAttemptId,
                coreAction,
                coreChannel,
                targetRail,
                attemptCount,
                now,
                zone);

        // 3. Evaluate Hard Bounds Engine
        BoundsEvaluationResult boundsResult = boundsEngine.evaluate(boundsContext);

        UUID decisionId = UUID.randomUUID();
        String jsonPayload = serializePayload(decision);
        UUID sagaId = null;

        if (boundsResult.isPermitted()) {
            if (decision.chosenAction() != RecoveryActionType.NO_ACTION && customerId != null) {
                // 4. Acquire distributed lock and trigger Saga workflow
                try (DistributedLockManager.DistributedLock lock =
                        lockManager.tryAcquireCustomerLock(merchantId, customerId, Duration.ofSeconds(30))) {
                    if (lock != null) {
                        RecoverySagaRecord saga = sagaCoordinator.startSaga(
                                merchantId,
                                paymentAttemptId,
                                Map.of(
                                        "chosen_action", decision.chosenAction().name(),
                                        "target_rail", targetRail,
                                        "expected_value", decision.expectedNetValuePaise()));
                        UUID businessSagaId = saga.getSagaId();
                        sagaId = saga.getId();

                        // Transition state
                        if (decision.chosenAction() == RecoveryActionType.RETRY_IMMEDIATE
                                || decision.chosenAction() == RecoveryActionType.RETRY_SCHEDULED) {
                            sagaCoordinator.transitionStep(merchantId, businessSagaId, SagaState.RETRY_INITIATED, Map.of("initiated_at", now.toString()));
                        } else if (decision.chosenAction() == RecoveryActionType.SWITCH_RAIL) {
                            sagaCoordinator.transitionStep(merchantId, businessSagaId, SagaState.RAIL_SWITCH_INITIATED, Map.of("target_rail", targetRail));
                        } else if (decision.chosenAction() == RecoveryActionType.CUSTOMER_NUDGE) {
                            sagaCoordinator.transitionStep(merchantId, businessSagaId, SagaState.CUSTOMER_NUDGED, Map.of("channel", decision.nudgeChannel() != null ? decision.nudgeChannel() : "SMS"));
                        }

                        // Carry the decision out. Until this call existed the
                        // saga transitioned to RETRY_INITIATED and stopped:
                        // the system recorded what it would have done and
                        // never did it.
                        executeAndSettle(
                                merchantId,
                                paymentAttemptId,
                                decision.chosenAction(),
                                targetRail,
                                businessSagaId,
                                attemptCount);
                    } else {
                        log.warn("Customer lock contested for merchant {} customer {}. Deferring action.", merchantId, customerId);
                    }
                }
            }

            // Append ledger record
            ledgerService.append(
                    merchantId,
                    "RECOVERY_DECISION",
                    paymentAttemptId,
                    "DECISION_PERMITTED",
                    serializePayload(Map.of(
                            "action", decision.chosenAction().name(),
                            "probability", decision.recoveryProbability(),
                            "net_value_paise", decision.expectedNetValuePaise(),
                            "saga_id", sagaId != null ? sagaId.toString() : "none")));

        } else {
            // Bounds rejected -> fail closed with immutable audit log
            String rejectionReason = boundsResult.reason();
            String guard = boundsResult.rejectedByGuard().orElse("UNKNOWN");

            log.info("Action {} for attempt {} rejected by bounds (guard={}): {}",
                    decision.chosenAction(), paymentAttemptId, guard, rejectionReason);

            ledgerService.append(
                    merchantId,
                    "RECOVERY_DECISION",
                    paymentAttemptId,
                    "BOUNDS_REJECTED",
                    serializePayload(Map.of(
                            "action", decision.chosenAction().name(),
                            "rejection_reason", rejectionReason,
                            "guard", guard)));
        }

        // 5. Persist recovery decision record
        String boundsRejection = boundsResult.isPermitted()
                ? null
                : boundsResult.rejectedByGuard().orElse("UNKNOWN") + ": " + boundsResult.reason();

        RecoveryDecisionRecord record = new RecoveryDecisionRecord(
                decisionId,
                merchantId,
                paymentAttemptId,
                decision.chosenAction(),
                BigDecimal.valueOf(decision.recoveryProbability()),
                decision.expectedNetValuePaise(),
                decision.targetRailId(),
                decision.scheduledDelaySeconds(),
                decision.nudgeChannel(),
                boundsResult.isPermitted() ? "PERMITTED" : "REJECTED",
                boundsRejection,
                sagaId,
                jsonPayload,
                now);

        return decisionRepository.save(record);
    }

    /**
     * Execute the chosen action and move the saga to a state that reflects
     * what actually happened.
     *
     * <p>The saga's terminal state is derived from the provider's answer, not
     * from the decision. A saga that reports COMPLETED because an action was
     * dispatched -- rather than because money moved -- is a saga that lies,
     * and every metric computed from it inherits the lie.
     *
     * <p>An indeterminate outcome deliberately does <em>not</em> fail the
     * saga. Money may have moved. It stays in flight, with an unresolved
     * {@code provider_operations} row for reconciliation to settle, because
     * marking it FAILED would invite a compensating refund for a payment that
     * may never have happened.
     */
    private void executeAndSettle(
            String merchantId,
            String paymentAttemptId,
            RecoveryActionType action,
            String targetRail,
            UUID businessSagaId,
            int attemptCount) {

        PaymentAttempt attempt =
                attemptRepository
                        .findByMerchantIdAndPaymentAttemptId(merchantId, paymentAttemptId)
                        .orElse(null);

        if (attempt == null) {
            // Nothing to charge against. Fail closed rather than invent an
            // amount: this system does not guess how much money to move.
            log.warn(
                    "no payment attempt {} for merchant {}; refusing to execute {}",
                    paymentAttemptId,
                    merchantId,
                    action);
            sagaCoordinator.transitionStep(
                    merchantId,
                    businessSagaId,
                    SagaState.FAILED,
                    Map.of("reason", "payment attempt not found; refusing to execute"));
            return;
        }

        // The event contract states that payment_attempt_id "maps 1:1 to a
        // provider-side payment ID", so it is what the reconciliation read is
        // performed against.
        RecoveryEffector.ExecutionResult result =
                effector.execute(
                        merchantId,
                        paymentAttemptId,
                        action,
                        paymentAttemptId,
                        attempt.getAmountPaise(),
                        attempt.getCurrency(),
                        targetRail,
                        attempt.getCustomerId(),
                        Math.max(1, attemptCount));

        SagaState next =
                switch (result.outcome()) {
                    case RECOVERED, ALREADY_PAID -> SagaState.COMPLETED;
                    case NOT_RECOVERED, BLOCKED_UNRESOLVED -> SagaState.FAILED;
                    // Still in flight. See the method comment.
                    case INDETERMINATE -> SagaState.RETRY_INITIATED;
                    case LINK_CREATED -> SagaState.CUSTOMER_NUDGED;
                    case NO_ACTION -> SagaState.COMPLETED;
                };

        sagaCoordinator.transitionStep(
                merchantId,
                businessSagaId,
                next,
                Map.of(
                        "execution_outcome", result.outcome().name(),
                        "detail", result.detail(),
                        "provider_state",
                        result.providerState() == null ? "NONE" : result.providerState().name()));

        log.info(
                "executed {} for attempt {}: {} ({})",
                action,
                paymentAttemptId,
                result.outcome(),
                result.detail());
    }

    private ActionType mapToCoreActionType(RecoveryActionType action) {
        if (action == null) {
            return ActionType.NO_ACTION;
        }
        return switch (action) {
            case RETRY_IMMEDIATE -> ActionType.RETRY_IMMEDIATE;
            case RETRY_SCHEDULED -> ActionType.RETRY_SCHEDULED;
            case SWITCH_RAIL -> ActionType.SWITCH_RAIL;
            case CUSTOMER_NUDGE -> ActionType.CUSTOMER_NUDGE;
            case NO_ACTION -> ActionType.NO_ACTION;
        };
    }

    private Channel mapToCoreChannel(String channelStr) {
        if (channelStr == null) {
            return null;
        }
        try {
            return Channel.valueOf(channelStr.toUpperCase());
        } catch (Exception e) {
            return null;
        }
    }

    private String serializePayload(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }
}
