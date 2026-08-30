package com.salvage.core.payment.model;

import java.util.Objects;

/**
 * An instruction to attempt a payment again.
 *
 * <p>{@code idempotencyKey} is the contract with the provider: the same key
 * must never charge twice, however many times this command is delivered. It is
 * derived deterministically from the attempt and the action rather than
 * generated, so that a redelivered Kafka message or a retried saga step
 * produces the same key and the provider collapses them.
 *
 * @param merchantId the tenant this payment belongs to
 * @param paymentAttemptId the original attempt being recovered
 * @param originalProviderPaymentId the provider's id for the failed payment, if any
 * @param amountPaise amount to charge, in paise
 * @param currency ISO 4217 code
 * @param targetRailId rail to route to, null to keep the original
 * @param customerId the payer, for provider-side customer records
 * @param idempotencyKey stable key the provider dedupes on
 */
public record RetryCommand(
        String merchantId,
        String paymentAttemptId,
        String originalProviderPaymentId,
        long amountPaise,
        String currency,
        String targetRailId,
        String customerId,
        String idempotencyKey) {

    public RetryCommand {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(paymentAttemptId, "paymentAttemptId must not be null");
        Objects.requireNonNull(currency, "currency must not be null");
        Objects.requireNonNull(idempotencyKey, "idempotencyKey must not be null");
        if (amountPaise <= 0) {
            throw new IllegalArgumentException("amountPaise must be positive, got " + amountPaise);
        }
    }
}
