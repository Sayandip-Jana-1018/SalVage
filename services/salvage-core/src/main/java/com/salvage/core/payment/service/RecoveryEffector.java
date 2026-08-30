package com.salvage.core.payment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.salvage.core.ledger.service.LedgerService;
import com.salvage.core.payment.PaymentProvider;
import com.salvage.core.payment.model.PaymentLinkCommand;
import com.salvage.core.payment.model.PaymentLinkResult;
import com.salvage.core.payment.model.PaymentState;
import com.salvage.core.payment.model.ProviderException;
import com.salvage.core.payment.model.ProviderOperation;
import com.salvage.core.payment.model.RetryCommand;
import com.salvage.core.payment.model.RetryResult;
import com.salvage.core.payment.repository.ProviderOperationRepository;
import com.salvage.core.policy.model.RecoveryActionType;
import java.time.Clock;
import java.time.Duration;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Carries out a recovery decision against the payment provider.
 *
 * <p>This is the effector: the layer that turns "the policy chose SWITCH_RAIL"
 * into a payment actually being attempted. Everything above it decides and
 * records; this is where money moves.
 *
 * <h2>Order of operations, and why it is this order</h2>
 *
 * <ol>
 *   <li><b>Look for an existing operation under the same key.</b> Exactly-once
 *       is enforced here as well as at the provider, so a redelivery is
 *       answered from our own record without a network call.
 *   <li><b>Reconcile before acting.</b> Ask the provider what happened to the
 *       original payment. A retry is permitted only on positive evidence that
 *       it failed -- never on the absence of evidence that it succeeded.
 *   <li><b>Record the intent before the call.</b> The operation row is written
 *       first, so a crash between the gateway taking money and the commit
 *       leaves a discoverable unresolved row rather than nothing at all.
 *   <li><b>Call the provider.</b>
 *   <li><b>Settle the row, then append to the ledger.</b>
 * </ol>
 *
 * <p>Steps 2 and 3 are the ones that get skipped in systems that later
 * discover they have been double-charging customers.
 */
@Service
public class RecoveryEffector {

    private static final Logger log = LoggerFactory.getLogger(RecoveryEffector.class);

    /** How long a generated payment link stays payable. */
    static final Duration LINK_VALIDITY = Duration.ofDays(3);

    private final PaymentProvider provider;
    private final ReconciliationGuard guard;
    private final ProviderOperationRepository operations;
    private final LedgerService ledger;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public RecoveryEffector(
            PaymentProvider provider,
            ReconciliationGuard guard,
            ProviderOperationRepository operations,
            LedgerService ledger,
            ObjectMapper objectMapper,
            Clock clock) {
        this.provider = Objects.requireNonNull(provider, "provider must not be null");
        this.guard = Objects.requireNonNull(guard, "guard must not be null");
        this.operations = Objects.requireNonNull(operations, "operations must not be null");
        this.ledger = Objects.requireNonNull(ledger, "ledger must not be null");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
        this.clock = Objects.requireNonNull(clock, "clock must not be null");
    }

    /** What the effector did, and what came of it. */
    public record ExecutionResult(
            Outcome outcome, String detail, PaymentState providerState, String providerReference) {

        public ExecutionResult {
            Objects.requireNonNull(outcome, "outcome must not be null");
            Objects.requireNonNull(detail, "detail must not be null");
        }
    }

    public enum Outcome {
        /** The payment went through. */
        RECOVERED,
        /** The provider was called and the payment failed again. */
        NOT_RECOVERED,
        /** A payable link was created and the customer has not paid it yet. */
        LINK_CREATED,
        /**
         * Reconciliation found the money had already moved. Nothing was
         * attempted, and that is a success for the customer even though this
         * system did not cause it.
         */
        ALREADY_PAID,
        /** Reconciliation could not establish that a retry was safe. */
        BLOCKED_UNRESOLVED,
        /**
         * The call was made and its outcome is unknown. Money may have moved.
         * An unresolved operation row exists for the sweep to pick up.
         */
        INDETERMINATE,
        /** The decision required no provider call. */
        NO_ACTION
    }

    /**
     * Execute one bounded recovery decision.
     *
     * <p>Callers must have run the bounds engine first. This method does not
     * re-check bounds -- it assumes an action reaching it was permitted -- and
     * it will refuse on safety grounds only, which is a different question.
     */
    @Transactional
    public ExecutionResult execute(
            String merchantId,
            String paymentAttemptId,
            RecoveryActionType action,
            String originalProviderPaymentId,
            long amountPaise,
            String currency,
            String targetRailId,
            String customerId,
            int ordinal) {

        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(paymentAttemptId, "paymentAttemptId must not be null");
        Objects.requireNonNull(action, "action must not be null");

        if (action == RecoveryActionType.NO_ACTION) {
            return new ExecutionResult(
                    Outcome.NO_ACTION, "policy chose to take no action", null, null);
        }

        if (action == RecoveryActionType.CUSTOMER_NUDGE) {
            return createLink(merchantId, paymentAttemptId, amountPaise, currency, customerId, ordinal);
        }

        return retry(
                merchantId,
                paymentAttemptId,
                originalProviderPaymentId,
                amountPaise,
                currency,
                targetRailId,
                customerId,
                ordinal);
    }

    // -- retry -------------------------------------------------------------

    private ExecutionResult retry(
            String merchantId,
            String paymentAttemptId,
            String originalProviderPaymentId,
            long amountPaise,
            String currency,
            String targetRailId,
            String customerId,
            int ordinal) {

        String key =
                IdempotencyKeys.forOperation(
                        merchantId, paymentAttemptId, ProviderOperation.Operation.RETRY.name(), ordinal);

        Optional<ProviderOperation> prior = operations.findByMerchantIdAndIdempotencyKey(merchantId, key);
        if (prior.isPresent()) {
            return replay(prior.get());
        }

        // Reconcile first. A retry is permitted only on positive evidence that
        // the original payment failed.
        ReconciliationGuard.Verdict verdict = guard.check(merchantId, originalProviderPaymentId);

        if (verdict.outcome() == ReconciliationGuard.Outcome.ALREADY_PAID) {
            ledger.append(
                    merchantId,
                    "RECOVERY_EXECUTION",
                    paymentAttemptId,
                    "RETRY_BLOCKED_ALREADY_PAID",
                    json(
                            Map.of(
                                    "reason", verdict.reason(),
                                    "provider_payment_id", String.valueOf(originalProviderPaymentId),
                                    "provider_state",
                                    verdict.evidence() == null
                                            ? "UNKNOWN"
                                            : verdict.evidence().state().name())));
            log.info(
                    "retry blocked for attempt {}: provider already holds the money", paymentAttemptId);
            return new ExecutionResult(
                    Outcome.ALREADY_PAID,
                    verdict.reason(),
                    verdict.evidence() == null ? null : verdict.evidence().state(),
                    originalProviderPaymentId);
        }

        if (!verdict.permitsRetry()) {
            ledger.append(
                    merchantId,
                    "RECOVERY_EXECUTION",
                    paymentAttemptId,
                    "RETRY_BLOCKED_UNRESOLVED",
                    json(Map.of("reason", verdict.reason())));
            log.warn("retry blocked for attempt {}: {}", paymentAttemptId, verdict.reason());
            return new ExecutionResult(
                    Outcome.BLOCKED_UNRESOLVED,
                    verdict.reason(),
                    verdict.evidence() == null ? null : verdict.evidence().state(),
                    originalProviderPaymentId);
        }

        // Intent recorded before the call, so a crash leaves a trace.
        ProviderOperation operation =
                operations.save(
                        new ProviderOperation(
                                UUID.randomUUID(),
                                merchantId,
                                paymentAttemptId,
                                provider.name(),
                                ProviderOperation.Operation.RETRY,
                                key,
                                amountPaise,
                                clock.instant()));

        RetryResult result;
        try {
            result =
                    provider.retry(
                            new RetryCommand(
                                    merchantId,
                                    paymentAttemptId,
                                    originalProviderPaymentId,
                                    amountPaise,
                                    currency,
                                    targetRailId,
                                    customerId,
                                    key));
        } catch (ProviderException e) {
            // The row stays UNKNOWN and unsettled. That is the correct record:
            // we called, and we do not know what happened. Settling it as
            // FAILED here would be inventing the one fact we lack.
            log.error(
                    "provider call failed for attempt {} (indeterminate={}): {}",
                    paymentAttemptId,
                    e.isIndeterminate(),
                    e.getMessage());
            ledger.append(
                    merchantId,
                    "RECOVERY_EXECUTION",
                    paymentAttemptId,
                    "RETRY_INDETERMINATE",
                    json(
                            Map.of(
                                    "idempotency_key", key,
                                    "indeterminate", e.isIndeterminate(),
                                    "error", e.getClass().getSimpleName())));
            return new ExecutionResult(
                    Outcome.INDETERMINATE,
                    "provider call did not return a usable answer; operation left unresolved",
                    PaymentState.UNKNOWN,
                    null);
        }

        operation.settle(
                result.state(),
                result.providerPaymentId(),
                result.providerErrorCode(),
                // Null, not zero, when the provider did not tell us. Zero
                // would read as "it moved nothing", which is a claim; null
                // reads as "it did not say", which is the truth.
                result.state() == PaymentState.UNKNOWN ? null : result.amountPaise(),
                json(
                        Map.of(
                                "state", result.state().name(),
                                "provider_payment_id", String.valueOf(result.providerPaymentId()))),
                clock.instant());
        operations.save(operation);

        ledger.append(
                merchantId,
                "RECOVERY_EXECUTION",
                paymentAttemptId,
                "RETRY_" + result.state().name(),
                json(
                        Map.of(
                                "idempotency_key", key,
                                "provider", provider.name(),
                                "provider_payment_id", String.valueOf(result.providerPaymentId()),
                                "amount_paise", result.amountPaise(),
                                "target_rail", String.valueOf(targetRailId))));

        if (result.recovered()) {
            return new ExecutionResult(
                    Outcome.RECOVERED, "payment captured", result.state(), result.providerPaymentId());
        }
        if (result.state() == PaymentState.UNKNOWN) {
            return new ExecutionResult(
                    Outcome.INDETERMINATE,
                    "provider returned UNKNOWN; the operation is recorded unresolved",
                    result.state(),
                    result.providerPaymentId());
        }
        return new ExecutionResult(
                Outcome.NOT_RECOVERED,
                "provider declined: " + String.valueOf(result.providerErrorCode()),
                result.state(),
                result.providerPaymentId());
    }

    // -- payment link ------------------------------------------------------

    private ExecutionResult createLink(
            String merchantId,
            String paymentAttemptId,
            long amountPaise,
            String currency,
            String customerId,
            int ordinal) {

        String key =
                IdempotencyKeys.forOperation(
                        merchantId,
                        paymentAttemptId,
                        ProviderOperation.Operation.PAYMENT_LINK.name(),
                        ordinal);

        Optional<ProviderOperation> prior = operations.findByMerchantIdAndIdempotencyKey(merchantId, key);
        if (prior.isPresent()) {
            return replay(prior.get());
        }

        // No reconciliation check here, and that is deliberate: creating a
        // payable link takes no money. The customer decides whether to pay it,
        // so it cannot double-charge anyone. What it can do is ask a customer
        // to pay something they have already paid -- which is why the link is
        // created against the attempt and the webhook that settles it goes
        // through the same reconciliation path.
        ProviderOperation operation =
                operations.save(
                        new ProviderOperation(
                                UUID.randomUUID(),
                                merchantId,
                                paymentAttemptId,
                                provider.name(),
                                ProviderOperation.Operation.PAYMENT_LINK,
                                key,
                                amountPaise,
                                clock.instant()));

        PaymentLinkResult link;
        try {
            link =
                    provider.createPaymentLink(
                            new PaymentLinkCommand(
                                    merchantId,
                                    paymentAttemptId,
                                    amountPaise,
                                    currency,
                                    customerId,
                                    "Complete your payment",
                                    LINK_VALIDITY,
                                    key));
        } catch (ProviderException e) {
            log.error("payment link creation failed for attempt {}: {}", paymentAttemptId, e.getMessage());
            return new ExecutionResult(
                    Outcome.INDETERMINATE,
                    "payment link creation did not return a usable answer",
                    PaymentState.UNKNOWN,
                    null);
        }

        operation.setProviderLinkId(link.providerLinkId());
        operation.settle(
                PaymentState.PENDING,
                null,
                null,
                null,
                json(Map.of("link_id", link.providerLinkId(), "expires_at", link.expiresAt().toString())),
                clock.instant());
        operations.save(operation);

        ledger.append(
                merchantId,
                "RECOVERY_EXECUTION",
                paymentAttemptId,
                "PAYMENT_LINK_CREATED",
                json(
                        Map.of(
                                "idempotency_key", key,
                                "provider", provider.name(),
                                "link_id", link.providerLinkId(),
                                "amount_paise", amountPaise,
                                "expires_at", link.expiresAt().toString())));

        // PENDING, not RECOVERED. A link that exists is not a payment that
        // happened, and reporting one as the other is how a recovery rate
        // becomes fiction.
        return new ExecutionResult(
                Outcome.LINK_CREATED, link.payableUrl(), PaymentState.PENDING, link.providerLinkId());
    }

    // -- shared ------------------------------------------------------------

    private ExecutionResult replay(ProviderOperation prior) {
        log.debug(
                "replaying prior provider operation {} for key {}",
                prior.getId(),
                prior.getIdempotencyKey());

        PaymentState state = prior.getOutcomeState();
        if (prior.getSettledAt() == null) {
            return new ExecutionResult(
                    Outcome.INDETERMINATE,
                    "a call under this key was started and never settled; it is awaiting reconciliation",
                    PaymentState.UNKNOWN,
                    prior.getProviderPaymentId());
        }
        if (prior.getOperation() == ProviderOperation.Operation.PAYMENT_LINK) {
            return new ExecutionResult(
                    Outcome.LINK_CREATED, "link already created", state, prior.getProviderLinkId());
        }
        if (state.isTerminalSuccess()) {
            return new ExecutionResult(
                    Outcome.RECOVERED, "already captured under this key", state, prior.getProviderPaymentId());
        }
        return new ExecutionResult(
                Outcome.NOT_RECOVERED,
                "already attempted under this key",
                state,
                prior.getProviderPaymentId());
    }

    private String json(Map<String, ?> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            // A serialisation failure must not silently drop an audit record.
            throw new IllegalStateException("failed to serialise ledger payload", e);
        }
    }
}
