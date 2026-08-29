package com.salvage.core.ingest;

/**
 * Thrown when an event names a merchant that is not provisioned.
 *
 * <p>Not retryable: the merchant will still not exist on redelivery. Tenants
 * are provisioned by an administrative action, never by an inbound event.
 */
public class UnknownMerchantException extends RuntimeException {

    private final String merchantId;

    public UnknownMerchantException(String merchantId) {
        super("Unknown merchant: " + merchantId);
        this.merchantId = merchantId;
    }

    public String merchantId() {
        return merchantId;
    }
}
