package com.salvage.core.saga.model;

public enum SagaState {
    STARTED,
    RETRY_INITIATED,
    RAIL_SWITCH_INITIATED,
    CUSTOMER_NUDGED,
    COMPENSATING,
    COMPLETED,
    FAILED
}
