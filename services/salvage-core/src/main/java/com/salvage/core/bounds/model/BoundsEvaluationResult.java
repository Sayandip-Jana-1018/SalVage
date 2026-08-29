package com.salvage.core.bounds.model;

import java.util.Optional;

/**
 * Result returned by the BoundsEngine gate.
 */
public record BoundsEvaluationResult(
        boolean isPermitted,
        String reason,
        Optional<String> rejectedByGuard) {

    public static BoundsEvaluationResult permit() {
        return new BoundsEvaluationResult(true, "Permitted by all safety bounds", Optional.empty());
    }

    public static BoundsEvaluationResult reject(String guardName, String reason) {
        return new BoundsEvaluationResult(false, reason, Optional.of(guardName));
    }
}
