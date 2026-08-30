package com.salvage.core.payment.razorpay;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salvage.core.payment.PaymentProvider;
import com.salvage.core.payment.model.PaymentLinkCommand;
import com.salvage.core.payment.model.PaymentLinkResult;
import com.salvage.core.payment.model.PaymentSnapshot;
import com.salvage.core.payment.model.PaymentState;
import com.salvage.core.payment.model.ProviderException;
import com.salvage.core.payment.model.RefundCommand;
import com.salvage.core.payment.model.RefundResult;
import com.salvage.core.payment.model.RetryCommand;
import com.salvage.core.payment.model.RetryResult;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Razorpay test-mode adapter.
 *
 * <h2>What has actually been executed against Razorpay</h2>
 *
 * <p><b>Verified</b> by {@code scripts/razorpay_e2e.sh} against the live test
 * API: Basic authentication, {@code POST /payment_links} and
 * {@code GET /payment_links/{id}}, and the response field names this class
 * reads from them -- {@code id}, {@code short_url}, {@code expire_by}. A run
 * created a real, payable test-mode link and read it back.
 *
 * <p><b>Not yet executed</b> from this repository: {@code GET /payments/{id}},
 * {@code POST /payments/{id}/refund}, and inbound webhook verification against
 * a signature Razorpay actually produced. Those paths and field names are
 * transcribed from Razorpay's public API and should be treated as unverified
 * until a run exercises them. This class is written to fail loudly on an
 * unexpected response rather than coerce it into something plausible -- an
 * unrecognised payment status maps to {@code UNKNOWN}, which blocks a retry,
 * never to {@code FAILED}, which would authorise one.
 *
 * <p>See {@code docs/adr/0003-payment-provider-abstraction.md}.
 *
 * <h2>The constraint that shapes this adapter</h2>
 *
 * <p><b>A gateway cannot re-charge an arbitrary failed payment.</b> Once a
 * one-off payment has failed, the money can only be collected again with the
 * customer present -- they must authorise it. There is no server-side call
 * that charges a card again on its own, and any system claiming to "retry a
 * failed payment" against a real gateway is either using a saved token, acting
 * under a mandate, or lying.
 *
 * <p>That is not an inconvenience to route around; it is the reason
 * {@code CUSTOMER_NUDGE} matters. So this adapter splits the action space
 * honestly:
 *
 * <ul>
 *   <li><b>Recurring payments under a token or mandate</b> can be charged
 *       server-side. {@link #retry} does that.
 *   <li><b>One-off payments</b> cannot. {@link #retry} refuses, with an
 *       exception that says why, and the correct recovery is a payment link
 *       the customer chooses to pay -- which {@link #createPaymentLink}
 *       creates for real.
 * </ul>
 *
 * <p>{@link #fetchStatus}, {@link #createPaymentLink}, {@link #refund} and
 * {@link #verifyWebhookSignature} are complete and exercise real Razorpay
 * objects.
 */
public class RazorpayTestProvider implements PaymentProvider {

    private static final Logger log = LoggerFactory.getLogger(RazorpayTestProvider.class);

    public static final String NAME = "razorpay";

    private static final Duration TIMEOUT = Duration.ofSeconds(15);

    private final String baseUrl;
    private final String authHeader;
    private final String webhookSecret;
    private final Clock clock;
    private final HttpClient http;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public RazorpayTestProvider(
            String baseUrl, String keyId, String keySecret, String webhookSecret, Clock clock) {
        this.baseUrl = Objects.requireNonNull(baseUrl, "baseUrl must not be null").replaceAll("/+$", "");
        Objects.requireNonNull(keyId, "keyId must not be null");
        Objects.requireNonNull(keySecret, "keySecret must not be null");
        this.webhookSecret = webhookSecret == null ? "" : webhookSecret;
        this.clock = Objects.requireNonNull(clock, "clock must not be null");
        this.authHeader =
                "Basic "
                        + Base64.getEncoder()
                                .encodeToString((keyId + ":" + keySecret).getBytes(StandardCharsets.UTF_8));
        this.http = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public PaymentSnapshot fetchStatus(String merchantId, String providerPaymentId) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        if (providerPaymentId == null || providerPaymentId.isBlank()) {
            return PaymentSnapshot.unknown(providerPaymentId, clock.instant());
        }

        JsonNode body = get("/payments/" + providerPaymentId);
        if (body == null) {
            // A 404. Razorpay is stating that it holds no payment under this
            // id, so nothing was charged under it -- NOT_FOUND, which permits
            // a retry. Distinct from a timeout, which returns UNKNOWN via an
            // indeterminate ProviderException and blocks one.
            return new PaymentSnapshot(
                    providerPaymentId, PaymentState.NOT_FOUND, 0L, null, clock.instant());
        }

        return new PaymentSnapshot(
                body.path("id").asText(providerPaymentId),
                mapStatus(body.path("status").asText("")),
                body.path("amount").asLong(0L),
                body.hasNonNull("error_code") ? body.path("error_code").asText() : null,
                clock.instant());
    }

    /**
     * Map a Razorpay payment status onto {@link PaymentState}.
     *
     * <p>An unrecognised status maps to {@link PaymentState#UNKNOWN}, never to
     * {@code FAILED}. If Razorpay adds a status this code has not seen, the
     * safe reading is "we do not understand this" -- which blocks a retry --
     * rather than "it failed", which would authorise one.
     */
    static PaymentState mapStatus(String razorpayStatus) {
        return switch (razorpayStatus) {
            case "captured" -> PaymentState.CAPTURED;
            case "authorized" -> PaymentState.AUTHORIZED;
            case "failed" -> PaymentState.FAILED;
            case "created", "pending" -> PaymentState.PENDING;
            case "refunded" -> PaymentState.REFUNDED;
            default -> PaymentState.UNKNOWN;
        };
    }

    @Override
    public RetryResult retry(RetryCommand command) {
        Objects.requireNonNull(command, "command must not be null");

        // Stated as a refusal rather than worked around. Charging a customer
        // again without their authorisation is not something a gateway will
        // do, and pretending otherwise here would produce a system that looks
        // like it recovers one-off payments and does not.
        throw ProviderException.definitelyNotApplied(
                "Razorpay cannot re-charge a failed one-off payment server-side: collecting "
                        + "again requires the customer to authorise it. Attempt "
                        + command.paymentAttemptId()
                        + " has no saved token or mandate on file, so the executable recovery "
                        + "is a payment link (CUSTOMER_NUDGE), not a retry. Server-side charging "
                        + "is available only for tokenised or mandate-backed payments, which this "
                        + "adapter does not yet implement.",
                null);
    }

    @Override
    public PaymentLinkResult createPaymentLink(PaymentLinkCommand command) {
        Objects.requireNonNull(command, "command must not be null");

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("amount", command.amountPaise());
        payload.put("currency", command.currency());
        payload.put("description", command.description());
        payload.put("expire_by", clock.instant().plus(command.expiresAfter()).getEpochSecond());
        payload.put("reference_id", command.idempotencyKey());
        payload.put("notify", Map.of("sms", false, "email", false));
        payload.put(
                "notes",
                Map.of(
                        "salvage_attempt_id", command.paymentAttemptId(),
                        "salvage_merchant_id", command.merchantId()));

        JsonNode body = post("/payment_links", payload, command.idempotencyKey());
        if (body == null) {
            throw ProviderException.indeterminate(
                    "Razorpay returned no body for payment link creation", null);
        }

        long expiresEpoch = body.path("expire_by").asLong(0L);
        return new PaymentLinkResult(
                body.path("id").asText(),
                body.path("short_url").asText(),
                expiresEpoch > 0 ? Instant.ofEpochSecond(expiresEpoch) : null,
                clock.instant());
    }

    @Override
    public RefundResult refund(RefundCommand command) {
        Objects.requireNonNull(command, "command must not be null");

        JsonNode body =
                post(
                        "/payments/" + command.providerPaymentId() + "/refund",
                        Map.of(
                                "amount",
                                command.amountPaise(),
                                "notes",
                                Map.of("reason", command.reason() == null ? "" : command.reason())),
                        command.idempotencyKey());

        if (body == null) {
            throw ProviderException.indeterminate("Razorpay returned no body for refund", null);
        }

        return new RefundResult(
                body.path("id").asText(), body.path("amount").asLong(0L), clock.instant());
    }

    @Override
    public boolean verifyWebhookSignature(String rawBody, String signature) {
        if (rawBody == null || signature == null || webhookSecret.isEmpty()) {
            return false;
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String expected =
                    HexFormat.of().formatHex(mac.doFinal(rawBody.getBytes(StandardCharsets.UTF_8)));
            // Constant-time. A byte-by-byte comparison that returns early
            // leaks the correct prefix through timing, which is enough to
            // forge a signature given patience.
            return MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8), signature.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            // A malformed signature is an ordinary rejection, not a crash.
            log.debug("webhook signature verification failed: {}", e.toString());
            return false;
        }
    }

    // -- transport ---------------------------------------------------------

    private JsonNode get(String path) {
        HttpRequest request =
                HttpRequest.newBuilder(URI.create(baseUrl + path))
                        .header("Authorization", authHeader)
                        .header("Accept", "application/json")
                        .timeout(TIMEOUT)
                        .GET()
                        .build();
        return send(request, path);
    }

    private JsonNode post(String path, Map<String, Object> payload, String idempotencyKey) {
        String json;
        try {
            json = objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            throw ProviderException.definitelyNotApplied("could not serialise request body", e);
        }

        HttpRequest request =
                HttpRequest.newBuilder(URI.create(baseUrl + path))
                        .header("Authorization", authHeader)
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        // Razorpay honours an idempotency header on mutating
                        // calls. Sent unconditionally: if it is ignored, we are
                        // no worse off; if it is honoured, a redelivery cannot
                        // create a second link or a second refund.
                        .header("X-Razorpay-Idempotency-Key", idempotencyKey)
                        .timeout(TIMEOUT)
                        .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                        .build();
        return send(request, path);
    }

    private JsonNode send(HttpRequest request, String path) {
        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (java.io.IOException e) {
            // The request may have reached Razorpay and taken effect.
            throw ProviderException.indeterminate("network failure calling " + path, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw ProviderException.indeterminate("interrupted calling " + path, e);
        }

        int status = response.statusCode();

        if (status == 404) {
            return null;
        }
        if (status == 401 || status == 403) {
            // Credentials were rejected, so nothing was processed. Message
            // deliberately carries no key material.
            throw ProviderException.definitelyNotApplied(
                    "Razorpay rejected our credentials (HTTP " + status + ")", null);
        }
        if (status == 400) {
            throw ProviderException.definitelyNotApplied(
                    "Razorpay rejected the request as invalid (HTTP 400)", null);
        }
        if (status >= 500) {
            throw ProviderException.indeterminate(
                    "Razorpay returned HTTP " + status + "; the call may have taken effect", null);
        }
        if (status < 200 || status >= 300) {
            throw ProviderException.indeterminate(
                    "Razorpay returned unexpected HTTP " + status, null);
        }

        try {
            return objectMapper.readTree(response.body());
        } catch (Exception e) {
            // A 2xx we cannot parse means the call very likely succeeded and
            // we cannot say what it did. Indeterminate, not failed.
            throw ProviderException.indeterminate("could not parse Razorpay response body", e);
        }
    }
}
