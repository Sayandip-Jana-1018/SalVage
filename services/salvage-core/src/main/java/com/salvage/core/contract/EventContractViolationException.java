package com.salvage.core.contract;

/**
 * Thrown when an inbound event does not satisfy its published schema.
 *
 * <p>This is not retryable. A payload that violates the contract will violate
 * it again on redelivery, so the consumer routes it aside rather than blocking
 * the partition behind an infinite retry loop.
 */
public class EventContractViolationException extends RuntimeException {

    public EventContractViolationException(String message) {
        super(message);
    }

    public EventContractViolationException(String message, Throwable cause) {
        super(message, cause);
    }
}
