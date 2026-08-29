package com.salvage.core.policy.model;

/**
 * Canonical recovery action types recommended by salvage-brain.
 */
public enum RecoveryActionType {
    RETRY_IMMEDIATE,
    RETRY_SCHEDULED,
    SWITCH_RAIL,
    CUSTOMER_NUDGE,
    NO_ACTION
}
