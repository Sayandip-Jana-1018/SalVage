package com.salvage.core.contract;

import java.io.IOException;
import java.io.InputStream;
import java.util.Set;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import org.springframework.stereotype.Component;

/**
 * Validates inbound event payloads against the JSON Schemas in
 * {@code contracts/events/}.
 *
 * <p>ADR-0002 makes the contracts directory the single source of truth. This
 * class is where that stops being an aspiration: a payload that does not
 * satisfy the schema is rejected at the edge and never reaches the ledger.
 * Validating at runtime rather than only at build time also covers the case
 * that matters most in production -- a producer we do not control changing
 * its payload without telling us.
 *
 * <p>The schema files are copied onto the classpath by the
 * {@code copyEventContracts} Gradle task, so there is exactly one copy of
 * each schema in the repository.
 */
@Component
public class EventContractValidator {

    private static final String SCHEMA_CLASSPATH_ROOT = "contracts/events/";

    private final ObjectMapper objectMapper;
    private final JsonSchema paymentFailedSchema;

    public EventContractValidator(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.paymentFailedSchema = load("payment_failed.v1.schema.json");
    }

    private JsonSchema load(String fileName) {
        String resource = SCHEMA_CLASSPATH_ROOT + fileName;
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                throw new IllegalStateException(
                        "Event schema not found on classpath: " + resource
                                + ". This means the copyEventContracts Gradle task did not run.");
            }
            JsonNode schemaNode = objectMapper.readTree(in);
            return JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012)
                    .getSchema(schemaNode);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to read event schema: " + resource, e);
        }
    }

    /**
     * Parses and validates a {@code payment_failed.v1} payload.
     *
     * @throws EventContractViolationException if the payload is not valid JSON
     *     or does not satisfy the schema
     */
    public PaymentFailedEvent parsePaymentFailed(String payload) {
        JsonNode node;
        try {
            node = objectMapper.readTree(payload);
        } catch (IOException e) {
            throw new EventContractViolationException(
                    "payment_failed.v1 payload is not valid JSON", e);
        }

        Set<ValidationMessage> violations = paymentFailedSchema.validate(node);
        if (!violations.isEmpty()) {
            // An explicit lambda rather than ValidationMessage::getMessage: the
            // library is not annotated for null analysis, so the method
            // reference forces an unchecked conversion of the receiver to
            // @NonNull. Sorting keeps the message deterministic, which matters
            // because it is what gets logged and asserted on.
            String detail = violations.stream()
                    .map(violation -> violation.getMessage())
                    .sorted()
                    .collect(Collectors.joining("; "));
            throw new EventContractViolationException(
                    "payment_failed.v1 payload violates its schema: " + detail);
        }

        try {
            return objectMapper.treeToValue(node, PaymentFailedEvent.class);
        } catch (IOException e) {
            // Schema-valid but unmappable means PaymentFailedEvent has drifted
            // from the schema. The contract test exists to catch this before
            // it can happen in production.
            throw new EventContractViolationException(
                    "payment_failed.v1 payload satisfied the schema but could not be "
                            + "bound to PaymentFailedEvent; the record has drifted from the schema",
                    e);
        }
    }
}
