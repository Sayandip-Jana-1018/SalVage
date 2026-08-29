package com.salvage.core.contract;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * The {@code payment_failed.v1} event.
 *
 * <p>This type mirrors {@code contracts/events/payment_failed.v1.schema.json},
 * which is the single source of truth (ADR-0002). Two mechanisms keep them
 * aligned, neither of which relies on anybody remembering:
 *
 * <ol>
 *   <li>Every inbound payload is validated against the schema at runtime by
 *       {@link EventContractValidator} before it reaches any business logic.</li>
 *   <li>{@code PaymentFailedEventContractTest} asserts that the set of record
 *       components is exactly the set of schema properties, so adding a field
 *       to the schema without adding it here fails the build.</li>
 * </ol>
 *
 * <p>{@code @JsonIgnoreProperties} is deliberately <em>not</em> permissive:
 * the schema declares {@code additionalProperties: false} and the validator
 * enforces that, so an unknown field is a contract violation rather than
 * something to silently drop.
 */
@JsonIgnoreProperties(ignoreUnknown = false)
public record PaymentFailedEvent(
        @JsonProperty("event_id") UUID eventId,
        @JsonProperty("event_version") int eventVersion,
        @JsonProperty("event_timestamp") Instant eventTimestamp,
        @JsonProperty("merchant_id") String merchantId,
        @JsonProperty("order_id") String orderId,
        @JsonProperty("payment_attempt_id") String paymentAttemptId,
        @JsonProperty("amount_paise") long amountPaise,
        @JsonProperty("currency") String currency,
        @JsonProperty("payment_method") String paymentMethod,
        @JsonProperty("provider") String provider,
        @JsonProperty("provider_error_code") String providerErrorCode,
        @JsonProperty("provider_error_description") String providerErrorDescription,
        @JsonProperty("issuer") String issuer,
        @JsonProperty("customer_id") String customerId,
        @JsonProperty("customer_phone_hash") String customerPhoneHash,
        @JsonProperty("customer_email_hash") String customerEmailHash,
        @JsonProperty("is_recurring") Boolean isRecurring,
        @JsonProperty("mandate_id") String mandateId,
        @JsonProperty("card_network") String cardNetwork,
        @JsonProperty("card_type") String cardType,
        @JsonProperty("upi_app") String upiApp,
        @JsonProperty("metadata") Map<String, String> metadata) {

    /**
     * The rail is the unit of health monitoring: issuer x method x provider.
     * Phase 3 keys all rail health state on this value, so it is derived in
     * exactly one place.
     */
    public String railId() {
        return issuer + "|" + paymentMethod + "|" + provider;
    }

    /** {@code is_recurring} is optional in the schema and defaults to false. */
    public boolean recurring() {
        return Boolean.TRUE.equals(isRecurring);
    }
}
