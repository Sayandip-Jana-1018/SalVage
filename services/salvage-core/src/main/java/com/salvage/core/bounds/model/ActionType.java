package com.salvage.core.bounds.model;

/**
 * Formal action space defined for recovery actions.
 */
public enum ActionType {
    RETRY_IMMEDIATE,
    RETRY_SCHEDULED,
    SWITCH_RAIL,
    CUSTOMER_NUDGE,
    ESCALATE_HUMAN,
    NO_ACTION;

    public boolean isCustomerCommunication() {
        return this == CUSTOMER_NUDGE;
    }

    public boolean isMoneyMovement() {
        return this == RETRY_IMMEDIATE || this == RETRY_SCHEDULED || this == SWITCH_RAIL;
    }
}
