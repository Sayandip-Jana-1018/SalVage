package com.salvage.core.payment;

import static org.assertj.core.api.Assertions.assertThat;

import com.salvage.core.payment.model.PaymentLinkCommand;
import com.salvage.core.payment.model.PaymentLinkResult;
import com.salvage.core.payment.model.PaymentSnapshot;
import com.salvage.core.payment.model.PaymentState;
import com.salvage.core.payment.model.ProviderException;
import com.salvage.core.payment.model.RefundCommand;
import com.salvage.core.payment.model.RefundResult;
import com.salvage.core.payment.model.RetryCommand;
import com.salvage.core.payment.model.RetryResult;
import com.salvage.core.payment.service.ReconciliationGuard;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.EnumSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * The guard decides whether it is safe to charge someone again.
 *
 * <p>Every test here is a variant of one question: does this state constitute
 * positive evidence that no money has moved? Two states do -- {@code FAILED}
 * ("this payment did not succeed") and {@code NOT_FOUND} ("no payment exists
 * under this id"). Both are the provider saying something. The rest of the
 * enum -- including, most importantly, {@code UNKNOWN}, which is the provider
 * saying nothing -- must block, because the cost of a wrong "yes" is a double
 * charge and the cost of a wrong "no" is a lost sale.
 */
class ReconciliationGuardTest {

    private static final Clock FIXED =
            Clock.fixed(Instant.parse("2026-08-31T10:00:00Z"), ZoneOffset.UTC);

    /** A provider that reports exactly one state, or throws. */
    private static final class StubProvider implements PaymentProvider {
        private final PaymentState state;
        private final RuntimeException failure;

        StubProvider(PaymentState state) {
            this.state = state;
            this.failure = null;
        }

        StubProvider(RuntimeException failure) {
            this.state = null;
            this.failure = failure;
        }

        @Override
        public String name() {
            return "stub";
        }

        @Override
        public PaymentSnapshot fetchStatus(String merchantId, String providerPaymentId) {
            if (failure != null) {
                throw failure;
            }
            return new PaymentSnapshot(providerPaymentId, state, 100L, null, FIXED.instant());
        }

        @Override
        public RetryResult retry(RetryCommand command) {
            throw new UnsupportedOperationException("the guard must never call retry");
        }

        @Override
        public PaymentLinkResult createPaymentLink(PaymentLinkCommand command) {
            throw new UnsupportedOperationException();
        }

        @Override
        public RefundResult refund(RefundCommand command) {
            throw new UnsupportedOperationException();
        }

        @Override
        public boolean verifyWebhookSignature(String rawBody, String signature) {
            return false;
        }
    }

    private ReconciliationGuard guardFor(PaymentState state) {
        return new ReconciliationGuard(new StubProvider(state), FIXED);
    }

    @Test
    void a_confirmed_failure_permits_a_retry() {
        ReconciliationGuard.Verdict verdict = guardFor(PaymentState.FAILED).check("m", "pay_1");

        assertThat(verdict.outcome()).isEqualTo(ReconciliationGuard.Outcome.SAFE_TO_RETRY);
        assertThat(verdict.permitsRetry()).isTrue();
    }

    @Test
    void a_captured_payment_blocks_the_retry_and_reports_it_as_already_paid() {
        ReconciliationGuard.Verdict verdict = guardFor(PaymentState.CAPTURED).check("m", "pay_1");

        assertThat(verdict.outcome()).isEqualTo(ReconciliationGuard.Outcome.ALREADY_PAID);
        assertThat(verdict.permitsRetry()).isFalse();
    }

    @Test
    void an_authorized_payment_blocks_the_retry() {
        // Money is held, not yet taken. Charging again would double-authorise.
        assertThat(guardFor(PaymentState.AUTHORIZED).check("m", "pay_1").outcome())
                .isEqualTo(ReconciliationGuard.Outcome.ALREADY_PAID);
    }

    @Test
    void an_unknown_state_blocks_the_retry() {
        // The single most important assertion in this class. "We could not
        // determine the state" is not permission to charge someone.
        ReconciliationGuard.Verdict verdict = guardFor(PaymentState.UNKNOWN).check("m", "pay_1");

        assertThat(verdict.outcome()).isEqualTo(ReconciliationGuard.Outcome.UNRESOLVED);
        assertThat(verdict.permitsRetry()).isFalse();
    }

    @Test
    void a_pending_payment_blocks_the_retry() {
        // A customer may be part-way through paying; starting a second payment
        // underneath them is how they pay twice.
        assertThat(guardFor(PaymentState.PENDING).check("m", "pay_1").permitsRetry()).isFalse();
    }

    @Test
    void a_refunded_payment_blocks_the_retry() {
        // Money moved out and came back. Whatever decided to refund did not
        // ask for the customer to be charged again.
        assertThat(guardFor(PaymentState.REFUNDED).check("m", "pay_1").permitsRetry()).isFalse();
    }

    @Test
    void a_failed_status_read_blocks_the_retry() {
        ReconciliationGuard guard =
                new ReconciliationGuard(
                        new StubProvider(ProviderException.indeterminate("gateway timeout", null)), FIXED);

        ReconciliationGuard.Verdict verdict = guard.check("m", "pay_1");

        assertThat(verdict.outcome()).isEqualTo(ReconciliationGuard.Outcome.UNRESOLVED);
        assertThat(verdict.evidence()).isNotNull();
        assertThat(verdict.evidence().state()).isEqualTo(PaymentState.UNKNOWN);
    }

    @Test
    void a_read_that_definitely_did_not_apply_still_blocks_the_retry() {
        // Even a read that provably had no effect leaves us ignorant of the
        // payment's state, and ignorance blocks.
        ReconciliationGuard guard =
                new ReconciliationGuard(
                        new StubProvider(ProviderException.definitelyNotApplied("bad credentials", null)),
                        FIXED);

        assertThat(guard.check("m", "pay_1").permitsRetry()).isFalse();
    }

    @Test
    void an_attempt_that_never_reached_the_provider_is_safe_to_retry() {
        // No provider payment id means nothing was ever created, so nothing
        // can be charged twice. The verdict says so explicitly rather than
        // passing silently.
        ReconciliationGuard.Verdict verdict = guardFor(PaymentState.FAILED).check("m", null);

        assertThat(verdict.permitsRetry()).isTrue();
        assertThat(verdict.reason()).contains("nothing exists to double-charge");
        assertThat(verdict.evidence()).isNull();
    }

    @Test
    void a_blank_provider_payment_id_is_treated_as_absent() {
        assertThat(guardFor(PaymentState.FAILED).check("m", "   ").permitsRetry()).isTrue();
    }

    @Test
    void a_payment_the_provider_has_never_heard_of_permits_a_retry() {
        // NOT_FOUND is information, not its absence: no payment exists under
        // this id, so nothing can be charged twice under it.
        assertThat(guardFor(PaymentState.NOT_FOUND).check("m", "pay_1").permitsRetry()).isTrue();
    }

    @Test
    void only_affirmative_evidence_permits_a_retry() {
        // Guards the enum against a future member being added with a
        // permissive default. If someone adds a state, this fails until they
        // decide deliberately which side it falls on.
        //
        // Exactly two states qualify, and both are the provider saying
        // something: FAILED ("this did not succeed") and NOT_FOUND ("no such
        // payment"). Every other state, including UNKNOWN, blocks.
        Set<PaymentState> permitted = EnumSet.of(PaymentState.FAILED, PaymentState.NOT_FOUND);

        for (PaymentState state : PaymentState.values()) {
            assertThat(guardFor(state).check("m", "pay_1").permitsRetry())
                    .as("state %s", state)
                    .isEqualTo(permitted.contains(state));
        }
    }
}
