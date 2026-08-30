package com.salvage.core.payment.service;

import com.salvage.core.payment.PaymentProvider;
import com.salvage.core.payment.model.PaymentSnapshot;
import com.salvage.core.payment.model.PaymentState;
import com.salvage.core.payment.model.ProviderException;
import java.time.Clock;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Asks the provider what actually happened before this system retries anything.
 *
 * <p>The failure this prevents: a payment whose gateway call timed out is
 * recorded as failed, a recovery policy quite reasonably retries it, and the
 * customer is charged twice for one order. The information needed to avoid
 * that always existed -- it was simply never asked for.
 *
 * <p>So every retry passes through here first, and the check is a read against
 * the provider rather than a read of our own database. Our database records
 * what we were told. Only the provider knows what it did.
 *
 * <h2>Fail closed</h2>
 *
 * <p>Three of the six {@link PaymentState} values permit a retry. Everything
 * else -- including, and especially, {@link PaymentState#UNKNOWN} -- blocks
 * it. "We could not determine the state" is not permission to charge someone.
 * A blocked recovery costs a merchant one sale; an unblocked double charge
 * costs them a customer, a chargeback and an explanation.
 */
@Service
public class ReconciliationGuard {

    private static final Logger log = LoggerFactory.getLogger(ReconciliationGuard.class);

    private final PaymentProvider provider;
    private final Clock clock;

    public ReconciliationGuard(PaymentProvider provider, Clock clock) {
        this.provider = Objects.requireNonNull(provider, "provider must not be null");
        this.clock = Objects.requireNonNull(clock, "clock must not be null");
    }

    /** Why a retry was permitted or refused, and the evidence it rested on. */
    public record Verdict(Outcome outcome, String reason, PaymentSnapshot evidence) {

        public Verdict {
            Objects.requireNonNull(outcome, "outcome must not be null");
            Objects.requireNonNull(reason, "reason must not be null");
        }

        public boolean permitsRetry() {
            return outcome == Outcome.SAFE_TO_RETRY;
        }
    }

    public enum Outcome {
        /** The provider confirms the payment did not succeed. Retrying is safe. */
        SAFE_TO_RETRY,

        /**
         * The provider holds money for this payment. Retrying would charge twice.
         *
         * <p>This is also good news that arrived late: the payment recovered
         * without us, and the recovery should be recorded rather than repeated.
         */
        ALREADY_PAID,

        /**
         * The provider did not give us an answer we can act on.
         *
         * <p>Blocks the retry and needs either a later re-check or a human.
         */
        UNRESOLVED
    }

    /**
     * Decide whether a payment may be retried.
     *
     * @param providerPaymentId the provider's id for the failed payment. Null
     *     when the original attempt never reached the provider, in which case
     *     there is no payment that could be charged twice.
     */
    public Verdict check(String merchantId, String providerPaymentId) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");

        if (providerPaymentId == null || providerPaymentId.isBlank()) {
            // Nothing was ever created at the provider, so nothing can be
            // double-charged. Recorded explicitly rather than passed silently:
            // "there was nothing to check" and "we checked and it is clear"
            // are different facts and the ledger should be able to tell them
            // apart six weeks from now.
            return new Verdict(
                    Outcome.SAFE_TO_RETRY,
                    "no provider payment id on the original attempt; nothing exists to double-charge",
                    null);
        }

        PaymentSnapshot snapshot;
        try {
            snapshot = provider.fetchStatus(merchantId, providerPaymentId);
        } catch (ProviderException e) {
            // A failed *read* leaves us exactly as ignorant as before, whether
            // or not the read itself was indeterminate. Block.
            log.warn(
                    "reconciliation read failed for {} ({}): {}",
                    providerPaymentId,
                    merchantId,
                    e.getMessage());
            return new Verdict(
                    Outcome.UNRESOLVED,
                    "provider status read failed: " + e.getClass().getSimpleName(),
                    PaymentSnapshot.unknown(providerPaymentId, clock.instant()));
        }

        PaymentState state = snapshot.state();

        if (state.isTerminalSuccess()) {
            log.info(
                    "reconciliation blocked a retry: {} is already {} at the provider",
                    providerPaymentId,
                    state);
            return new Verdict(
                    Outcome.ALREADY_PAID,
                    "provider reports " + state + "; the money has already moved",
                    snapshot);
        }

        if (state.isSafeToRetry()) {
            return new Verdict(Outcome.SAFE_TO_RETRY, "provider confirms FAILED", snapshot);
        }

        // PENDING: a customer may be part-way through paying, and starting a
        // second payment underneath them is how they pay twice.
        // REFUNDED: money moved out and came back; retrying would take it
        // again, and whatever decided to refund did not ask for that.
        // UNKNOWN: no information.
        return new Verdict(
                Outcome.UNRESOLVED,
                "provider reports " + state + ", which is not evidence that a retry is safe",
                snapshot);
    }
}
