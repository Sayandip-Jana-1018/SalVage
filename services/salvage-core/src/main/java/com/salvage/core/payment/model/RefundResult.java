package com.salvage.core.payment.model;

import java.time.Instant;
import java.util.Objects;

/**
 * A completed or accepted refund.
 *
 * @param providerRefundId the provider's id for the refund
 * @param amountPaise amount returned
 * @param refundedAt when the provider accepted it
 */
public record RefundResult(String providerRefundId, long amountPaise, Instant refundedAt) {

    public RefundResult {
        Objects.requireNonNull(providerRefundId, "providerRefundId must not be null");
        Objects.requireNonNull(refundedAt, "refundedAt must not be null");
    }
}
