package com.salvage.core.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaTemplate;

import com.salvage.core.contract.EventContractValidator;
import com.salvage.core.contract.PaymentFailedEvent;
import com.salvage.core.contract.SampleEvents;
import com.salvage.core.model.Merchant;
import com.salvage.core.repository.FailureEventRepository;
import com.salvage.core.repository.MerchantRepository;
import com.salvage.core.repository.PaymentAttemptRepository;

/**
 * End-to-end proof that the Phase 0 substrate works: a message produced to
 * Redpanda is consumed, validated against the published schema, and written
 * transactionally to PostgreSQL, with the health endpoint reporting all three
 * dependencies reachable.
 *
 * <p>Containers come from {@link SalvageInfrastructure}, which starts them in a
 * static initialiser. That ordering is deliberate: the previous version of this
 * test started containers in {@code @BeforeAll} and guarded its
 * {@code @DynamicPropertySource} with null checks, so whenever Spring built the
 * context first the overrides were silently skipped and the "container" test
 * ran against whatever happened to be listening on localhost.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        // This class is about what the code below computes, not about the
        // gate in front of it. Authentication has its own tests in
        // com.salvage.core.api.auth; ApiAuthenticationTest is the one that
        // turns it on and proves a merchant key cannot read another tenant.
        properties = "salvage.auth.required=false")
class PaymentIngestIntegrationTest extends SalvageInfrastructure {

    private static final ParameterizedTypeReference<Map<String, Object>> MAP_TYPE =
            new ParameterizedTypeReference<>() {};

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    @Autowired
    private EventContractValidator validator;

    @Autowired
    private MerchantRepository merchants;

    @Autowired
    private PaymentAttemptRepository attempts;

    @Autowired
    private FailureEventRepository failures;

    @Autowired
    private PaymentIngestService ingestService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void ensureMerchantsExist() {
        ensureMerchant(SampleEvents.MERCHANT_ID, "Demo Merchant");
    }

    private void ensureMerchant(String merchantId, String name) {
        if (!merchants.existsByMerchantId(merchantId)) {
            merchants.save(new Merchant(merchantId, name));
        }
    }

    /** Parses a payload the same way the consumer does, then ingests it. */
    private IngestResult ingest(String payload) {
        return ingestService.ingest(validator.parsePaymentFailed(payload));
    }

    private PaymentFailedEvent parse(String payload) {
        return validator.parsePaymentFailed(payload);
    }

    // ---- health -----------------------------------------------------------

    @Test
    void readiness_reports_all_three_dependencies_reachable() {
        ResponseEntity<Map<String, Object>> response =
                restTemplate.exchange("/health/readiness", HttpMethod.GET, null, MAP_TYPE);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> body = Objects.requireNonNull(response.getBody());
        assertThat(body.get("status")).isEqualTo("healthy");

        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> checks =
                (Map<String, Map<String, Object>>) body.get("checks");
        assertThat(checks).containsOnlyKeys("postgres", "redis", "kafka");
        assertThat(checks.get("postgres").get("status")).isEqualTo("up");
        assertThat(checks.get("redis").get("status")).isEqualTo("up");
        assertThat(checks.get("kafka").get("status")).isEqualTo("up");
    }

    // ---- the round trip ---------------------------------------------------

    @Test
    void a_message_produced_to_kafka_is_consumed_validated_and_persisted() {
        UUID eventId = UUID.randomUUID();
        String attemptId = "pay_" + eventId;

        kafkaTemplate.send(PaymentFailedConsumer.TOPIC, attemptId,
                SampleEvents.valid(eventId, attemptId));

        Awaitility.await().atMost(Duration.ofSeconds(30)).untilAsserted(() ->
                assertThat(failures.findByMerchantIdAndEventId(SampleEvents.MERCHANT_ID, eventId))
                        .isPresent());

        var attempt = attempts
                .findByMerchantIdAndPaymentAttemptId(SampleEvents.MERCHANT_ID, attemptId)
                .orElseThrow();
        assertThat(attempt.getAmountPaise()).isEqualTo(249900L);
        assertThat(attempt.getIssuer()).isEqualTo("issuer_alpha");
        assertThat(attempt.getRawEvent()).contains("BAD_REQUEST_ERROR");
        assertThat(attempt.getCreatedAt()).isNotNull();

        var failure = failures
                .findByMerchantIdAndEventId(SampleEvents.MERCHANT_ID, eventId).orElseThrow();
        assertThat(failure.getRailId()).isEqualTo("issuer_alpha|upi|razorpay");
        assertThat(failure.getPaymentAttemptId()).isEqualTo(attempt.getId());
        // Nothing has classified it yet; Phase 3 owns the taxonomy.
        assertThat(failure.getTaxonomyCode()).isNull();
    }

    @Test
    void redelivering_the_same_event_does_not_create_a_second_row() {
        UUID eventId = UUID.randomUUID();
        String payload = SampleEvents.valid(eventId, "pay_" + eventId);

        IngestResult first = ingest(payload);
        assertThat(first.duplicate()).isFalse();

        long attemptsBefore = attempts.countByMerchantId(SampleEvents.MERCHANT_ID);
        long failuresBefore = failures.countByMerchantId(SampleEvents.MERCHANT_ID);

        IngestResult second = ingest(payload);

        assertThat(second.duplicate()).isTrue();
        assertThat(second.paymentAttemptId()).isEqualTo(first.paymentAttemptId());
        assertThat(attempts.countByMerchantId(SampleEvents.MERCHANT_ID)).isEqualTo(attemptsBefore);
        assertThat(failures.countByMerchantId(SampleEvents.MERCHANT_ID)).isEqualTo(failuresBefore);
    }

    @Test
    void two_failures_on_one_attempt_share_the_attempt_row() {
        String attemptId = "pay_shared_" + UUID.randomUUID();

        IngestResult first = ingest(SampleEvents.valid(UUID.randomUUID(), attemptId));
        IngestResult second = ingest(SampleEvents.valid(UUID.randomUUID(), attemptId));

        assertThat(second.duplicate()).isFalse();
        assertThat(second.paymentAttemptId()).isEqualTo(first.paymentAttemptId());
        assertThat(failures.findByMerchantIdAndPaymentAttemptId(
                SampleEvents.MERCHANT_ID, first.paymentAttemptId())).hasSize(2);
    }

    @Test
    void an_event_for_an_unprovisioned_merchant_is_rejected_rather_than_creating_a_tenant() {
        PaymentFailedEvent event = parse(
                SampleEvents.valid(UUID.randomUUID(), "pay_orphan")
                        .replace(SampleEvents.MERCHANT_ID, "merch_not_provisioned"));

        assertThatThrownBy(() -> ingestService.ingest(event))
                .isInstanceOf(UnknownMerchantException.class);
        assertThat(merchants.existsByMerchantId("merch_not_provisioned")).isFalse();
    }

    // ---- schema guarantees ------------------------------------------------

    @Test
    void payment_attempts_are_append_only_at_the_database_level() {
        String attemptId = "pay_immutable_" + UUID.randomUUID();
        ingest(SampleEvents.valid(UUID.randomUUID(), attemptId));

        assertThatThrownBy(() -> jdbcTemplate.update(
                "UPDATE salvage.payment_attempts SET amount_paise = 1 "
                        + "WHERE merchant_id = ? AND payment_attempt_id = ?",
                SampleEvents.MERCHANT_ID, attemptId))
                .hasMessageContaining("append-only");

        assertThatThrownBy(() -> jdbcTemplate.update(
                "DELETE FROM salvage.payment_attempts "
                        + "WHERE merchant_id = ? AND payment_attempt_id = ?",
                SampleEvents.MERCHANT_ID, attemptId))
                .hasMessageContaining("append-only");
    }

    /**
     * A failure event must not be able to reference an attempt owned by a
     * different tenant. A plain foreign key on the attempt id alone would
     * permit exactly that, which is why the schema uses a composite key
     * carrying merchant_id.
     */
    @Test
    void a_failure_event_cannot_reference_another_tenants_attempt() {
        ensureMerchant("merch_other", "Other Merchant");
        IngestResult mine = ingest(SampleEvents.valid(UUID.randomUUID(),
                "pay_tenant_" + UUID.randomUUID()));

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO salvage.failure_events "
                        + "(merchant_id, event_id, payment_attempt_id, provider_error_code, "
                        + " rail_id, event_timestamp) VALUES (?, ?, ?, ?, ?, now())",
                "merch_other", UUID.randomUUID(), mine.paymentAttemptId(),
                "STOLEN", "issuer_alpha|upi|razorpay"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void a_classification_without_a_classifier_version_is_rejected() {
        IngestResult result = ingest(SampleEvents.valid(UUID.randomUUID(),
                "pay_taxonomy_" + UUID.randomUUID()));

        assertThatThrownBy(() -> jdbcTemplate.update(
                "INSERT INTO salvage.failure_events "
                        + "(merchant_id, event_id, payment_attempt_id, provider_error_code, "
                        + " taxonomy_code, rail_id, event_timestamp) "
                        + "VALUES (?, ?, ?, ?, ?, ?, now())",
                SampleEvents.MERCHANT_ID, UUID.randomUUID(), result.paymentAttemptId(),
                "ERR", "ISSUER_DOWN", "issuer_alpha|upi|razorpay"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
