package com.salvage.core.payment.model;

import java.time.Instant;
import java.util.Objects;

/**
 * What came back from attempting a payment again.
 *
 * <p>A result whose {@code state} is {@link PaymentState#UNKNOWN} is not a
 * failure and must not be recorded as one. It means the attempt may or may not
 * have taken money, and the only correct next step is to reconcile rather than
 * to try again.
 *
 * @param providerPaymentId the id the provider issued, null if it issued none
 * @param state the outcome as the provider reports it
 * @param amountPaise amount the provider acted on
 * @param providerErrorCode the provider's failure code, null unless failed
 * @param attemptedAt when the call was made
 */
public record RetryResult(
        String providerPaymentId,
        PaymentState state,
        long amountPaise,
        String providerErrorCode,
        Instant attemptedAt) {

    public RetryResult {
        Objects.requireNonNull(state, "state must not be null");
        Objects.requireNonNull(attemptedAt, "attemptedAt must not be null");
    }

    public boolean recovered() {
        return state.isTerminalSuccess();
    }
}
