package com.salvage.core.payment.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.salvage.core.ingest.SalvageInfrastructure;
import com.salvage.core.ledger.repository.LedgerEntryRepository;
import com.salvage.core.model.Merchant;
import com.salvage.core.payment.PaymentProvider;
import com.salvage.core.payment.simulated.SimulatedProvider;
import com.salvage.core.repository.MerchantRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The webhook endpoint is an unauthenticated write into the money pipeline.
 *
 * <p>Which is to say it is not unauthenticated at all: the signature is the
 * authentication, and the first four tests here exist because an endpoint that
 * accepts an unsigned body lets anyone who learns the URL assert that a
 * payment succeeded.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ProviderWebhookControllerTest extends SalvageInfrastructure {

    @LocalServerPort private int port;

    @Autowired private TestRestTemplate rest;
    @Autowired private PaymentProvider provider;
    @Autowired private MerchantRepository merchants;
    @Autowired private LedgerEntryRepository ledgerEntries;
    @Autowired private TransactionTemplate transactionTemplate;

    private String url() {
        return "http://localhost:" + port + "/api/v1/webhooks/payments";
    }

    private String registerMerchant() {
        String merchantId = "m_wh_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        transactionTemplate.executeWithoutResult(
                status -> merchants.save(new Merchant(merchantId, "Webhook Test")));
        return merchantId;
    }

    private String body(String event, String merchantId, String attemptId, String paymentId) {
        return """
            {"event":"%s","payload":{"payment":{"entity":{"id":"%s","amount":249900,\
            "notes":{"salvage_merchant_id":"%s","salvage_attempt_id":"%s"}}}}}"""
                .formatted(event, paymentId, merchantId, attemptId);
    }

    private org.springframework.http.ResponseEntity<String> post(String payload, String signature) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (signature != null) {
            headers.set(ProviderWebhookController.SIGNATURE_HEADER, signature);
        }
        return rest.postForEntity(url(), new HttpEntity<>(payload, headers), String.class);
    }

    private String sign(String payload) {
        return ((SimulatedProvider) provider).expectedSignature(payload);
    }

    @Test
    void an_unsigned_webhook_is_rejected() {
        String payload = body("payment.captured", registerMerchant(), "pay_1", "sim_pay_1");

        assertThat(post(payload, null).getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void a_wrongly_signed_webhook_is_rejected() {
        String payload = body("payment.captured", registerMerchant(), "pay_1", "sim_pay_1");

        assertThat(post(payload, "deadbeef").getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void a_signature_for_a_different_body_is_rejected() {
        // The attack this stops: replaying a valid signature against altered
        // content, e.g. changing the amount or the event type.
        String merchant = registerMerchant();
        String original = body("payment.failed", merchant, "pay_1", "sim_pay_1");
        String tampered = body("payment.captured", merchant, "pay_1", "sim_pay_1");

        assertThat(post(tampered, sign(original)).getStatusCode().value()).isEqualTo(401);
    }

    @Test
    void a_rejection_says_nothing_about_why() {
        // Telling an unauthenticated caller which part of the signature was
        // wrong helps them produce a right one.
        String payload = body("payment.captured", registerMerchant(), "pay_1", "sim_pay_1");

        String responseBody = post(payload, "deadbeef").getBody();

        assertThat(responseBody).contains("invalid_signature");
        assertThat(responseBody).doesNotContain("expected");
    }

    @Test
    void a_correctly_signed_webhook_is_accepted_and_recorded_in_the_ledger() {
        String merchant = registerMerchant();
        String payload = body("payment.captured", merchant, "pay_ok", "sim_pay_ok");

        assertThat(post(payload, sign(payload)).getStatusCode().value()).isEqualTo(200);

        assertThat(ledgerEntries.findByMerchantIdOrderByEntryIndexDesc(merchant, Limit.of(20)))
                .extracting(entry -> entry.getEventType())
                .contains("WEBHOOK_PAYMENT_CAPTURED");
    }

    @Test
    void a_webhook_for_an_unknown_merchant_is_acknowledged_not_retried_forever() {
        // A 5xx would make the provider redeliver an event that can never
        // become processable.
        String payload = body("payment.captured", "m_not_hosted_here", "pay_1", "sim_pay_1");

        var response = post(payload, sign(payload));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).contains("ignored_unknown_merchant");
    }

    @Test
    void an_event_type_we_do_not_handle_is_still_recorded() {
        // Evidence of something the provider did. Dropping it makes the audit
        // trail incomplete in exactly the way audits exist to prevent.
        String merchant = registerMerchant();
        String payload = body("payment.some_future_event", merchant, "pay_fut", "sim_pay_fut");

        assertThat(post(payload, sign(payload)).getStatusCode().value()).isEqualTo(200);

        assertThat(ledgerEntries.findByMerchantIdOrderByEntryIndexDesc(merchant, Limit.of(20)))
                .extracting(entry -> entry.getEventType())
                .contains("WEBHOOK_UNHANDLED");
    }

    @Test
    void a_signed_but_unparseable_body_is_a_400_not_a_500() {
        String payload = "{not json";

        assertThat(post(payload, sign(payload)).getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void the_event_type_mapping_is_total() {
        // Every branch returns a non-blank action, including the default.
        for (String event :
                new String[] {
                    "payment.captured",
                    "payment.failed",
                    "payment.authorized",
                    "payment_link.paid",
                    "refund.processed",
                    "anything.else",
                    ""
                }) {
            assertThat(ProviderWebhookController.webhookAction(event)).isNotBlank();
        }
    }
}
