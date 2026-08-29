package com.salvage.core.ledger.service;

import java.util.Optional;

/**
 * Result of cryptographically verifying a merchant's ledger hash chain.
 */
public record VerificationResult(
        boolean isValid,
        long verifiedEntriesCount,
        Optional<String> latestHash,
        Optional<Long> failureIndex,
        Optional<String> failureReason) {

    public static VerificationResult valid(long count, String latestHash) {
        return new VerificationResult(true, count, Optional.ofNullable(latestHash), Optional.empty(), Optional.empty());
    }

    public static VerificationResult tampered(long failureIndex, String reason) {
        return new VerificationResult(false, failureIndex - 1, Optional.empty(), Optional.of(failureIndex), Optional.of(reason));
    }
}
