package com.salvage.core.idempotency.exception;

/**
 * Thrown when another worker is currently executing the same idempotency key.
 */
public class ConcurrentOperationException extends RuntimeException {

    public ConcurrentOperationException(String message) {
        super(message);
    }
}
