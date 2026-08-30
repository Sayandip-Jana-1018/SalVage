package com.salvage.core.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salvage.core.contract.EventContractValidator;
import com.salvage.core.ingest.PaymentFailedConsumer;
import com.salvage.core.repository.MerchantRepository;
import java.util.Map;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Publish a {@code payment_failed.v1} event onto the ingest topic.
 *
 * This exists so the operator console's checkout page can drive the real
 * pipeline instead of animating one. Pressing the button publishes an event to
 * Kafka; {@link PaymentFailedConsumer} picks it up, validates it against the
 * published schema, and writes the attempt and failure rows. The console then
 * polls the ordinary read path until the attempt appears. Nothing about that
 * flow is special-cased for the demo -- it is the same path a gateway webhook
 * would take.
 *
 * <p>It replaces a page that faked the whole thing: a chain of
 * {@code setTimeout} calls that printed "Ingested failure: ... 88.4% error rate
 * across 34 merchants ... Ledger Commit: Appended sha256 hash block #48220"
 * without contacting anything.
 *
 * <p><strong>This is a write endpoint and it is disabled unless explicitly
 * enabled.</strong> It publishes events attributed to a merchant, which
 * downstream causes decisions to be recorded against that merchant. That is
 * fine for a demo stack and unacceptable on a shared deployment, so it is
 * gated on {@code salvage.demo-ingest.enabled}, which defaults to false. The
 * runbook says to leave it false outside local use.
 *
 * <p>It publishes and returns. It does not wait for the consumer, because the
 * point of an event pipeline is that the producer does not block on it, and a
 * synchronous "recovered!" response would be describing an outcome that has
 * not happened yet.
 */
@RestController
@RequestMapping("/api/v1/demo")
public class DemoIngestController {

    private static final Logger log = LoggerFactory.getLogger(DemoIngestController.class);

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final EventContractValidator validator;
    private final MerchantRepository merchants;
    private final ObjectMapper objectMapper;
    private final boolean enabled;

    public DemoIngestController(
            KafkaTemplate<String, String> kafkaTemplate,
            EventContractValidator validator,
            MerchantRepository merchants,
            ObjectMapper objectMapper,
            @Value("${salvage.demo-ingest.enabled:false}") boolean enabled) {
        this.kafkaTemplate = Objects.requireNonNull(kafkaTemplate, "kafkaTemplate must not be null");
        this.validator = Objects.requireNonNull(validator, "validator must not be null");
        this.merchants = Objects.requireNonNull(merchants, "merchants must not be null");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
        this.enabled = enabled;
    }

    @PostMapping("/payment-failed")
    public ResponseEntity<?> publish(@RequestBody Map<String, Object> event) {
        if (!enabled) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ApiExceptionHandler.ApiError("demo_ingest_disabled", null));
        }

        String payload;
        try {
            payload = objectMapper.writeValueAsString(event);
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(new ApiExceptionHandler.ApiError("unserialisable_event", null));
        }

        // Parsed through the same validator the consumer uses, which throws on
        // a schema violation. Rejecting at the edge gives the caller a
        // synchronous, actionable error instead of a message that vanishes
        // into a log line on the other side of Kafka. The parsed value is
        // discarded: this endpoint publishes the caller's bytes, so that what
        // the consumer validates is exactly what was sent rather than a
        // re-serialisation of it.
        try {
            validator.parsePaymentFailed(payload);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest()
                    .body(new ApiExceptionHandler.ApiError("contract_violation", e.getMessage()));
        }

        Object merchantId = event.get("merchant_id");
        if (merchantId == null || !merchants.existsByMerchantId(merchantId.toString())) {
            // The consumer fails closed on an unknown merchant rather than
            // provisioning one, so publishing would drop the message. Saying so
            // here is more useful than a silent no-op.
            return ResponseEntity.badRequest()
                    .body(
                            new ApiExceptionHandler.ApiError(
                                    "unknown_merchant",
                                    "No merchant "
                                            + merchantId
                                            + " is provisioned. salvage-core does not create tenants on ingest."));
        }

        kafkaTemplate.send(PaymentFailedConsumer.TOPIC, merchantId.toString(), payload);
        log.info("demo ingest published event for merchant {}", merchantId);

        return ResponseEntity.accepted()
                .body(new Published(PaymentFailedConsumer.TOPIC, String.valueOf(event.get("event_id"))));
    }

    /** 202 body: what was published, not what resulted from it. */
    public record Published(
            @JsonProperty("topic") String topic, @JsonProperty("event_id") String eventId) {}
}
