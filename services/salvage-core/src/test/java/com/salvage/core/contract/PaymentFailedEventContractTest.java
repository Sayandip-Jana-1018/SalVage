package com.salvage.core.contract;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.InputStream;
import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The drift gate for ADR-0002.
 *
 * <p>ADR-0002 says the contracts directory is the single source of truth. That
 * claim needs a mechanism, not a promise. This test asserts that the set of
 * JSON names on {@link PaymentFailedEvent} is exactly the set of properties in
 * {@code payment_failed.v1.schema.json}. Adding a field to the schema without
 * adding it to the record fails the build, and so does the reverse.
 */
class PaymentFailedEventContractTest {

    private ObjectMapper objectMapper;
    private EventContractValidator validator;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
        validator = new EventContractValidator(objectMapper);
    }

    private JsonNode schema() throws Exception {
        try (InputStream in = getClass().getClassLoader()
                .getResourceAsStream("contracts/events/payment_failed.v1.schema.json")) {
            assertThat(in)
                    .as("schema must be on the test classpath via the copyEventContracts task")
                    .isNotNull();
            return objectMapper.readTree(in);
        }
    }

    private static Set<String> jsonNamesOf(Class<?> recordType) {
        return Arrays.stream(recordType.getRecordComponents())
                .map(PaymentFailedEventContractTest::jsonName)
                .collect(Collectors.toCollection(TreeSet::new));
    }

    /**
     * Jackson's {@code @JsonProperty} declares no {@code RECORD_COMPONENT}
     * target, so {@link RecordComponent#getAnnotation} never sees it. The
     * compiler does propagate it to the generated accessor and backing field,
     * which is where it has to be read from.
     */
    private static String jsonName(RecordComponent component) {
        JsonProperty onAccessor = component.getAccessor().getAnnotation(JsonProperty.class);
        if (onAccessor != null) {
            return onAccessor.value();
        }
        try {
            JsonProperty onField = component.getDeclaringRecord()
                    .getDeclaredField(component.getName())
                    .getAnnotation(JsonProperty.class);
            if (onField != null) {
                return onField.value();
            }
        } catch (NoSuchFieldException ignored) {
            // Fall through to the component name.
        }
        return component.getName();
    }

    @Test
    void record_fields_match_schema_properties_exactly() throws Exception {
        Set<String> schemaProperties = new TreeSet<>();
        schema().get("properties").fieldNames().forEachRemaining(schemaProperties::add);

        assertThat(jsonNamesOf(PaymentFailedEvent.class))
                .as("PaymentFailedEvent has drifted from payment_failed.v1.schema.json")
                .isEqualTo(schemaProperties);
    }

    @Test
    void every_schema_required_field_is_non_optional_in_practice() throws Exception {
        Set<String> required = new TreeSet<>();
        schema().get("required").forEach(node -> required.add(node.asText()));

        assertThat(jsonNamesOf(PaymentFailedEvent.class)).containsAll(required);
    }

    @Test
    void a_fully_populated_valid_event_parses() {
        PaymentFailedEvent event = validator.parsePaymentFailed(SampleEvents.valid());

        assertThat(event.merchantId()).isEqualTo("merch_demo");
        assertThat(event.amountPaise()).isEqualTo(249900L);
        assertThat(event.railId()).isEqualTo("issuer_alpha|upi|razorpay");
        assertThat(event.recurring()).isFalse();
    }

    @Test
    void missing_required_field_is_rejected() {
        String payload = SampleEvents.withoutField("issuer");

        assertThatThrownBy(() -> validator.parsePaymentFailed(payload))
                .isInstanceOf(EventContractViolationException.class)
                .hasMessageContaining("issuer");
    }

    @Test
    void unknown_field_is_rejected_because_the_schema_forbids_additional_properties() {
        String payload = SampleEvents.withExtraField("surprise", "\"value\"");

        assertThatThrownBy(() -> validator.parsePaymentFailed(payload))
                .isInstanceOf(EventContractViolationException.class);
    }

    @Test
    void payment_method_outside_the_enum_is_rejected() {
        String payload = SampleEvents.valid().replace("\"upi\"", "\"cheque\"");

        assertThatThrownBy(() -> validator.parsePaymentFailed(payload))
                .isInstanceOf(EventContractViolationException.class);
    }

    @Test
    void zero_amount_is_rejected_because_a_zero_value_payment_cannot_fail() {
        String payload = SampleEvents.valid().replace("249900", "0");

        assertThatThrownBy(() -> validator.parsePaymentFailed(payload))
                .isInstanceOf(EventContractViolationException.class);
    }

    @Test
    void malformed_json_is_rejected_as_a_contract_violation_not_a_crash() {
        assertThatThrownBy(() -> validator.parsePaymentFailed("{not json"))
                .isInstanceOf(EventContractViolationException.class)
                .hasMessageContaining("not valid JSON");
    }
}
