package com.salvage.core.payment.model;

import java.time.Duration;
import java.util.Objects;

/**
 * An instruction to create a link the customer can pay through.
 *
 * <p>This is what a {@code CUSTOMER_NUDGE} actually produces: a real,
 * payable link rather than a message asking someone to start again. The
 * message that carries it is a separate concern and is not this port's job.
 *
 * @param merchantId the tenant
 * @param paymentAttemptId the attempt being recovered
 * @param amountPaise amount the link should collect
 * @param currency ISO 4217 code
 * @param customerId the payer
 * @param description shown to the customer on the payment page
 * @param expiresAfter how long the link stays payable
 * @param idempotencyKey stable key so a redelivery does not create a second link
 */
public record PaymentLinkCommand(
        String merchantId,
        String paymentAttemptId,
        long amountPaise,
        String currency,
        String customerId,
        String description,
        Duration expiresAfter,
        String idempotencyKey) {

    public PaymentLinkCommand {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(paymentAttemptId, "paymentAttemptId must not be null");
        Objects.requireNonNull(currency, "currency must not be null");
        Objects.requireNonNull(expiresAfter, "expiresAfter must not be null");
        Objects.requireNonNull(idempotencyKey, "idempotencyKey must not be null");
        if (amountPaise <= 0) {
            throw new IllegalArgumentException("amountPaise must be positive, got " + amountPaise);
        }
        if (expiresAfter.isNegative() || expiresAfter.isZero()) {
            throw new IllegalArgumentException("expiresAfter must be positive, got " + expiresAfter);
        }
    }
}
