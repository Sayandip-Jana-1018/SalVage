package com.salvage.core.payment.model;

import java.time.Instant;
import java.util.Objects;

/**
 * A created payment link.
 *
 * @param providerLinkId the provider's id for the link
 * @param payableUrl where the customer pays
 * @param expiresAt when the link stops working
 * @param createdAt when it was created
 */
public record PaymentLinkResult(
        String providerLinkId, String payableUrl, Instant expiresAt, Instant createdAt) {

    public PaymentLinkResult {
        Objects.requireNonNull(providerLinkId, "providerLinkId must not be null");
        Objects.requireNonNull(payableUrl, "payableUrl must not be null");
        Objects.requireNonNull(createdAt, "createdAt must not be null");
    }
}
