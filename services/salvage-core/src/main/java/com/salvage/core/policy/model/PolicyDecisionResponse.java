package com.salvage.core.policy.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.List;

/**
 * Representation of the policy decision response received from salvage-brain /v1/decide.
 */
public record PolicyDecisionResponse(
        @JsonProperty("payment_attempt_id") String paymentAttemptId,
        @JsonProperty("chosen_action") RecoveryActionType chosenAction,
        @JsonProperty("recovery_probability") double recoveryProbability,
        @JsonProperty("expected_net_value_paise") long expectedNetValuePaise,
        @JsonProperty("target_rail_id") String targetRailId,
        @JsonProperty("scheduled_delay_seconds") Integer scheduledDelaySeconds,
        @JsonProperty("nudge_channel") String nudgeChannel,
        @JsonProperty("reasoning_tokens") List<String> reasoningTokens,
        @JsonProperty("decided_at") Instant decidedAt) {
}
