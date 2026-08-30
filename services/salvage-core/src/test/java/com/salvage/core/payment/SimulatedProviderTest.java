package com.salvage.core.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.salvage.core.payment.model.PaymentLinkCommand;
import com.salvage.core.payment.model.PaymentLinkResult;
import com.salvage.core.payment.model.PaymentSnapshot;
import com.salvage.core.payment.model.PaymentState;
import com.salvage.core.payment.model.RefundCommand;
import com.salvage.core.payment.model.RetryCommand;
import com.salvage.core.payment.model.RetryResult;
import com.salvage.core.payment.simulated.SimulatedProvider;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * The simulated provider is a component with behaviour, not a stub.
 *
 * <p>The tests that matter here are the determinism ones and the timeout one.
 * Determinism is what makes a recovery replayable; the timeout behaviour is
 * what makes the double-charge bug reproducible instead of hypothetical.
 */
class SimulatedProviderTest {

    private static final Clock FIXED =
            Clock.fixed(Instant.parse("2026-08-31T10:00:00Z"), ZoneOffset.UTC);

    private SimulatedProvider provider(double success, double timeout, double capturedOnTimeout) {
        return new SimulatedProvider(20260831L, success, timeout, capturedOnTimeout, FIXED);
    }

    private RetryCommand command(String key) {
        return new RetryCommand(
                "merch_1", "pay_1", "sim_pay_original", 249900L, "INR", null, "cust_1", key);
    }

    @Test
    void the_same_idempotency_key_never_charges_twice() {
        SimulatedProvider provider = provider(1.0, 0.0, 0.0);

        RetryResult first = provider.retry(command("key_a"));
        RetryResult second = provider.retry(command("key_a"));

        assertThat(first.state()).isEqualTo(PaymentState.CAPTURED);
        // Identical, including the payment id: the second call replayed the
        // first result rather than creating a second payment.
        assertThat(second).isEqualTo(first);
    }

    @Test
    void different_keys_are_different_payments() {
        SimulatedProvider provider = provider(1.0, 0.0, 0.0);

        RetryResult first = provider.retry(command("key_a"));
        RetryResult second = provider.retry(command("key_b"));

        assertThat(second.providerPaymentId()).isNotEqualTo(first.providerPaymentId());
    }

    @Test
    void outcomes_are_reproducible_across_instances_with_the_same_seed() {
        // Two independent providers, same seed. A recovery that cannot be
        // replayed bit-identically cannot be audited.
        RetryResult a = provider(0.5, 0.2, 0.5).retry(command("key_replay"));
        RetryResult b = provider(0.5, 0.2, 0.5).retry(command("key_replay"));

        assertThat(b).isEqualTo(a);
    }

    @Test
    void a_different_seed_produces_a_different_world() {
        SimulatedProvider one = new SimulatedProvider(1L, 0.5, 0.2, 0.5, FIXED);
        SimulatedProvider two = new SimulatedProvider(2L, 0.5, 0.2, 0.5, FIXED);

        Set<String> ids = new HashSet<>();
        for (int i = 0; i < 20; i++) {
            ids.add(one.retry(command("k" + i)).providerPaymentId());
            ids.add(two.retry(command("k" + i)).providerPaymentId());
        }
        // 40 calls across two seeds must not collapse into 20 payments.
        assertThat(ids).hasSize(40);
    }

    @Test
    void a_timed_out_call_reports_unknown_and_never_failed() {
        // Every call times out. UNKNOWN is not a failure, and the caller is
        // given no amount, because it does not know one.
        SimulatedProvider provider = provider(0.0, 1.0, 1.0);

        RetryResult result = provider.retry(command("key_timeout"));

        assertThat(result.state()).isEqualTo(PaymentState.UNKNOWN);
        assertThat(result.recovered()).isFalse();
        assertThat(result.amountPaise()).isZero();
        assertThat(result.providerErrorCode()).isNull();
    }

    @Test
    void a_timed_out_call_can_have_captured_the_money_and_the_status_read_reveals_it() {
        // This is the double-charge scenario, made reproducible: the call the
        // caller saw time out did take the money. Only fetchStatus knows.
        SimulatedProvider provider = provider(0.0, 1.0, 1.0);

        RetryResult result = provider.retry(command("key_silent_capture"));
        assertThat(result.state()).isEqualTo(PaymentState.UNKNOWN);

        PaymentSnapshot truth = provider.fetchStatus("merch_1", result.providerPaymentId());

        assertThat(truth.state()).isEqualTo(PaymentState.CAPTURED);
        assertThat(truth.amountPaise()).isEqualTo(249900L);
        // A caller that treated the UNKNOWN as a decline and retried would
        // have charged this customer twice.
        assertThat(result.state().isSafeToRetry()).isFalse();
    }

    @Test
    void a_timed_out_call_that_did_not_capture_reads_back_as_failed() {
        SimulatedProvider provider = provider(0.0, 1.0, 0.0);

        RetryResult result = provider.retry(command("key_timeout_failed"));
        PaymentSnapshot truth = provider.fetchStatus("merch_1", result.providerPaymentId());

        assertThat(result.state()).isEqualTo(PaymentState.UNKNOWN);
        assertThat(truth.state()).isEqualTo(PaymentState.FAILED);
        assertThat(truth.state().isSafeToRetry()).isTrue();
    }

    @Test
    void an_unrecognised_payment_id_reads_as_not_found_and_permits_a_retry() {
        // NOT_FOUND, not UNKNOWN. The provider is stating positively that it
        // holds no payment under this id, so nothing can be charged twice --
        // which is what lets an attempt that arrived from elsewhere (a
        // webhook, an imported failure) be retried at all.
        PaymentSnapshot snapshot = provider(1.0, 0.0, 0.0).fetchStatus("merch_1", "sim_pay_nonexistent");

        assertThat(snapshot.state()).isEqualTo(PaymentState.NOT_FOUND);
        assertThat(snapshot.state().isSafeToRetry()).isTrue();
        // And it is still not a success, so nothing counts it as a recovery.
        assertThat(snapshot.state().isTerminalSuccess()).isFalse();
    }

    @Test
    void a_payment_link_is_pending_and_not_a_recovery() {
        PaymentLinkResult link =
                provider(1.0, 0.0, 0.0)
                        .createPaymentLink(
                                new PaymentLinkCommand(
                                        "merch_1",
                                        "pay_1",
                                        249900L,
                                        "INR",
                                        "cust_1",
                                        "Complete your payment",
                                        Duration.ofDays(3),
                                        "key_link"));

        assertThat(link.payableUrl()).isNotBlank();
        assertThat(link.expiresAt()).isAfter(FIXED.instant());
    }

    @Test
    void creating_the_same_link_twice_returns_the_same_link() {
        SimulatedProvider provider = provider(1.0, 0.0, 0.0);
        PaymentLinkCommand command =
                new PaymentLinkCommand(
                        "merch_1", "pay_1", 249900L, "INR", "cust_1", "d", Duration.ofDays(3), "key_link");

        assertThat(provider.createPaymentLink(command))
                .isEqualTo(provider.createPaymentLink(command));
    }

    @Test
    void refunding_a_payment_the_provider_never_captured_is_refused() {
        // Returning money that was never taken is not a no-op; it is a
        // withdrawal from the merchant.
        assertThatThrownBy(
                        () ->
                                provider(1.0, 0.0, 0.0)
                                        .refund(
                                                new RefundCommand(
                                                        "merch_1", "sim_pay_never_existed", 100L, "test", "key_r")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("holds no captured payment");
    }

    @Test
    void a_captured_payment_can_be_refunded_once() {
        SimulatedProvider provider = provider(1.0, 0.0, 0.0);
        RetryResult captured = provider.retry(command("key_to_refund"));

        RefundCommand refund =
                new RefundCommand(
                        "merch_1", captured.providerPaymentId(), 249900L, "compensation", "key_refund");

        assertThat(provider.refund(refund)).isEqualTo(provider.refund(refund));
        assertThat(provider.fetchStatus("merch_1", captured.providerPaymentId()).state())
                .isEqualTo(PaymentState.REFUNDED);
    }

    @Test
    void a_webhook_signature_is_verified_and_a_wrong_one_is_rejected() {
        SimulatedProvider provider = provider(1.0, 0.0, 0.0);
        String body = "{\"event\":\"payment.captured\"}";

        assertThat(provider.verifyWebhookSignature(body, provider.expectedSignature(body))).isTrue();
        assertThat(provider.verifyWebhookSignature(body, "deadbeef")).isFalse();
        assertThat(provider.verifyWebhookSignature(body, null)).isFalse();
        // A different body must not verify under the first body's signature.
        assertThat(provider.verifyWebhookSignature("{\"event\":\"other\"}", provider.expectedSignature(body)))
                .isFalse();
    }

    @Test
    void the_configured_rates_must_be_coherent() {
        assertThatThrownBy(() -> new SimulatedProvider(1L, 0.8, 0.5, 0.0, FIXED))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not exceed 1.0");

        assertThatThrownBy(() -> new SimulatedProvider(1L, 1.5, 0.0, 0.0, FIXED))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("successRate must be in [0,1]");
    }
}
