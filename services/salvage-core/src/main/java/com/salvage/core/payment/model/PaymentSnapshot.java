package com.salvage.core.payment.model;

import java.time.Instant;
import java.util.Objects;

/**
 * What the provider said about one payment, and when it said it.
 *
 * <p>{@code observedAt} is not decoration. A reconciliation decision made on a
 * stale read is a decision made on the wrong facts, and the guard checks the
 * age of this value before trusting it.
 *
 * @param providerPaymentId the provider's own id, null when it never issued one
 * @param state what the provider reports
 * @param amountPaise the amount the provider holds for this payment, in paise
 * @param providerErrorCode the provider's failure code, null unless failed
 * @param observedAt when this was read from the provider
 */
public record PaymentSnapshot(
        String providerPaymentId,
        PaymentState state,
        long amountPaise,
        String providerErrorCode,
        Instant observedAt) {

    public PaymentSnapshot {
        Objects.requireNonNull(state, "state must not be null");
        Objects.requireNonNull(observedAt, "observedAt must not be null");
        if (amountPaise < 0) {
            throw new IllegalArgumentException("amountPaise must not be negative, got " + amountPaise);
        }
    }

    /** A read that told us nothing, which is a fact worth recording as one. */
    public static PaymentSnapshot unknown(String providerPaymentId, Instant observedAt) {
        return new PaymentSnapshot(providerPaymentId, PaymentState.UNKNOWN, 0L, null, observedAt);
    }
}
