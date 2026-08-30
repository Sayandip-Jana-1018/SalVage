package com.salvage.core.contract;

import java.util.UUID;

/**
 * Canonical {@code payment_failed.v1} payloads for tests.
 *
 * <p>Built as text rather than by serialising {@link PaymentFailedEvent}, on
 * purpose: a fixture generated from the type under test cannot detect that the
 * type has drifted from the schema, because it would drift with it.
 */
public final class SampleEvents {

    public static final String MERCHANT_ID = "merch_demo";

    private SampleEvents() {
    }

    public static String valid() {
        return valid(UUID.fromString("11111111-1111-4111-8111-111111111111"), "pay_demo_0001");
    }

    public static String valid(UUID eventId, String paymentAttemptId) {
        return """
                {
                  "event_id": "%s",
                  "event_version": 1,
                  "event_timestamp": "2026-08-29T10:15:30Z",
                  "merchant_id": "%s",
                  "order_id": "order_demo_0001",
                  "payment_attempt_id": "%s",
                  "amount_paise": 249900,
                  "currency": "INR",
                  "payment_method": "upi",
                  "provider": "razorpay",
                  "provider_error_code": "BAD_REQUEST_ERROR",
                  "provider_error_description": "Payment processing failed at the issuer",
                  "issuer": "issuer_alpha",
                  "customer_id": "cust_demo_0001",
                  "is_recurring": false
                }
                """.formatted(eventId, MERCHANT_ID, paymentAttemptId);
    }

    /** The same event with one required property removed. */
    public static String withoutField(String field) {
        return valid().lines()
                .filter(line -> !line.trim().startsWith("\"" + field + "\""))
                .reduce("", (a, b) -> a.isEmpty() ? b : a + "\n" + b)
                // Removing a middle line can leave a trailing comma before the
                // closing brace; normalise so the payload stays parseable and
                // the test exercises schema validation rather than JSON syntax.
                .replaceAll(",(\\s*})", "$1");
    }

    /** The same event with an extra property the schema does not declare. */
    public static String withExtraField(String name, String jsonValue) {
        return valid().replaceFirst("\\{", "{\n  \"" + name + "\": " + jsonValue + ",");
    }
}
