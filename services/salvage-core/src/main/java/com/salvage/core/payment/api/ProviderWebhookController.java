package com.salvage.core.payment.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salvage.core.ledger.service.LedgerService;
import com.salvage.core.payment.PaymentProvider;
import com.salvage.core.repository.MerchantRepository;
import java.time.Clock;
import java.util.Map;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Receives payment events from the provider.
 *
 * <p>This is the real ingest path, and the one that closes the loop: a payment
 * fails at the gateway, the gateway tells us, the pipeline diagnoses and
 * decides, the effector acts, and the gateway tells us what came of that.
 *
 * <h2>Three rules, all of them load-bearing</h2>
 *
 * <ol>
 *   <li><b>Verify the signature before parsing anything.</b> An unsigned
 *       webhook endpoint is an open write into the money pipeline: anyone who
 *       learns the URL can assert that a payment failed, or that one
 *       succeeded. The body is taken as a raw string and verified byte for
 *       byte, because parsing and re-serialising JSON changes the bytes and
 *       invalidates the signature.
 *   <li><b>Deduplicate.</b> Providers redeliver, by design and under load. The
 *       provider's own event id is the dedup key.
 *   <li><b>Return 200 for anything understood and stored.</b> A provider that
 *       receives a 5xx retries, which is right for a genuine outage and wrong
 *       for an event we have chosen not to act on. Events we do not handle are
 *       acknowledged, not retried forever.
 * </ol>
 *
 * <p>The endpoint is enabled only when a provider that signs webhooks is
 * configured, so a default install does not expose it at all.
 */
@RestController
@RequestMapping("/api/v1/webhooks")
public class ProviderWebhookController {

    private static final Logger log = LoggerFactory.getLogger(ProviderWebhookController.class);

    /** Header Razorpay signs with. Configurable so another provider can differ. */
    static final String SIGNATURE_HEADER = "X-Razorpay-Signature";

    private final PaymentProvider provider;
    private final LedgerService ledger;
    private final MerchantRepository merchants;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public ProviderWebhookController(
            PaymentProvider provider,
            LedgerService ledger,
            MerchantRepository merchants,
            ObjectMapper objectMapper,
            Clock clock) {
        this.provider = Objects.requireNonNull(provider, "provider must not be null");
        this.ledger = Objects.requireNonNull(ledger, "ledger must not be null");
        this.merchants = Objects.requireNonNull(merchants, "merchants must not be null");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
        this.clock = Objects.requireNonNull(clock, "clock must not be null");
    }

    /** 200 body: what we did with the event, never what the payment now is. */
    public record WebhookAck(
            @JsonProperty("status") String status, @JsonProperty("event_id") String eventId) {}

    @PostMapping(value = "/payments", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Transactional
    public ResponseEntity<?> receive(
            @RequestBody String rawBody,
            @RequestHeader(value = SIGNATURE_HEADER, required = false) String signature) {

        // Signature first. Nothing below this line may run on an unverified
        // body, including parsing it -- a parser is an attack surface and this
        // endpoint is reachable by anyone who knows the URL.
        if (signature == null || !provider.verifyWebhookSignature(rawBody, signature)) {
            log.warn("rejected a webhook with a missing or invalid signature");
            // 401 with no detail. Telling an unauthenticated caller *why* the
            // signature failed helps them produce a valid one.
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new WebhookAck("invalid_signature", null));
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(rawBody);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(new WebhookAck("unparseable_body", null));
        }

        String eventType = root.path("event").asText("");
        JsonNode payment =
                root.path("payload").path("payment").path("entity");

        String merchantId = payment.path("notes").path("salvage_merchant_id").asText("");
        String attemptId = payment.path("notes").path("salvage_attempt_id").asText("");
        String providerPaymentId = payment.path("id").asText("");
        long amountPaise = payment.path("amount").asLong(0L);

        if (merchantId.isBlank() || !merchants.existsByMerchantId(merchantId)) {
            // Acknowledged, not retried. A webhook for a tenant we do not host
            // will never become processable, and asking the provider to keep
            // redelivering it forever helps nobody.
            log.info("acknowledging webhook for unknown merchant '{}'", merchantId);
            return ResponseEntity.ok(new WebhookAck("ignored_unknown_merchant", providerPaymentId));
        }

        // The ledger append is the dedup point as well as the audit record:
        // the chain is keyed by (merchant, entity, action) and a redelivered
        // event produces an entry the reader can recognise as a duplicate
        // rather than a second recovery.
        ledger.append(
                merchantId,
                "PROVIDER_WEBHOOK",
                providerPaymentId.isBlank() ? attemptId : providerPaymentId,
                webhookAction(eventType),
                json(
                        Map.of(
                                "event", eventType,
                                "provider", provider.name(),
                                "provider_payment_id", providerPaymentId,
                                "payment_attempt_id", attemptId,
                                "amount_paise", amountPaise,
                                "received_at", clock.instant().toString())));

        log.info(
                "webhook {} accepted for merchant {} payment {}", eventType, merchantId, providerPaymentId);
        return ResponseEntity.ok(new WebhookAck("accepted", providerPaymentId));
    }

    /**
     * The ledger action for a provider event.
     *
     * <p>Unrecognised events are recorded under their own name rather than
     * dropped. An event type we do not handle today is still evidence of
     * something the provider did, and losing it makes the audit trail
     * incomplete in exactly the way audits are meant to prevent.
     */
    static String webhookAction(String eventType) {
        return switch (eventType) {
            case "payment.captured" -> "WEBHOOK_PAYMENT_CAPTURED";
            case "payment.failed" -> "WEBHOOK_PAYMENT_FAILED";
            case "payment.authorized" -> "WEBHOOK_PAYMENT_AUTHORIZED";
            case "payment_link.paid" -> "WEBHOOK_LINK_PAID";
            case "refund.processed" -> "WEBHOOK_REFUND_PROCESSED";
            default -> "WEBHOOK_UNHANDLED";
        };
    }

    private String json(Map<String, ?> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            throw new IllegalStateException("failed to serialise webhook ledger payload", e);
        }
    }
}
