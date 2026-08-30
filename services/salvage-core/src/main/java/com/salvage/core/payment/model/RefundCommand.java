package com.salvage.core.payment.model;

import java.util.Objects;

/**
 * An instruction to return money.
 *
 * <p>The compensating action of a recovery saga. It exists because a saga that
 * cannot undo its own step is not a saga -- and because the one case this
 * system must be able to correct is the one where reconciliation discovers a
 * payment it had already treated as failed.
 *
 * @param merchantId the tenant
 * @param providerPaymentId the payment to refund
 * @param amountPaise amount to return, in paise
 * @param reason recorded on the refund and in the ledger
 * @param idempotencyKey stable key so a redelivery does not refund twice
 */
public record RefundCommand(
        String merchantId,
        String providerPaymentId,
        long amountPaise,
        String reason,
        String idempotencyKey) {

    public RefundCommand {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(providerPaymentId, "providerPaymentId must not be null");
        Objects.requireNonNull(idempotencyKey, "idempotencyKey must not be null");
        if (amountPaise <= 0) {
            throw new IllegalArgumentException("amountPaise must be positive, got " + amountPaise);
        }
    }
}
