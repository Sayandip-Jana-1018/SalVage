package com.salvage.core.bounds.model;

import java.time.Instant;
import java.time.ZoneId;

/**
 * Context passed into the BoundsEngine for recovery action evaluation.
 */
public record BoundsContext(
        String merchantId,
        String customerId,
        String paymentAttemptId,
        ActionType proposedAction,
        Channel channel,
        String railId,
        int currentAttemptCount,
        Instant timestamp,
        ZoneId customerZone) {
}
