package com.salvage.core.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.Map;

/**
 * Counted-from-rows telemetry for one merchant over one window.
 *
 * <p>Deliberately reports counts and one monetary total, and stops there. It
 * does not report a "recovery rate", because salvage-core cannot honestly
 * compute one: knowing whether a recovery action actually recovered the
 * payment requires observing a later success on the same order within the
 * attribution window, and the execution path that would produce that
 * observation is not wired to a payment provider yet. A field named
 * {@code recovery_rate_pct} would be filled with something, and whatever it
 * was filled with would be read as the product's headline claim.
 *
 * <p>{@code expectedNetValuePaise} is the sum of the policy's own expected
 * value over permitted decisions. It is an expectation the model produced, not
 * money observed to have arrived, and the field name says so.
 */
public record MerchantStats(
        @JsonProperty("merchant_id") String merchantId,
        @JsonProperty("window_hours") int windowHours,
        @JsonProperty("window_start") Instant windowStart,
        @JsonProperty("failures_observed") long failuresObserved,
        @JsonProperty("decisions_made") long decisionsMade,
        @JsonProperty("decisions_permitted") long decisionsPermitted,
        @JsonProperty("decisions_refused_by_bounds") long decisionsRefusedByBounds,
        @JsonProperty("expected_net_value_paise_permitted") long expectedNetValuePaisePermitted,
        @JsonProperty("taxonomy_breakdown") Map<String, Long> taxonomyBreakdown,
        @JsonProperty("action_breakdown") Map<String, Long> actionBreakdown,
        /**
         * True when the window held more rows than the aggregation cap, so the
         * breakdowns cover a prefix rather than the whole window. Present so a
         * consumer can say "at least" instead of stating a total it does not
         * have.
         */
        @JsonProperty("truncated") boolean truncated) {}
