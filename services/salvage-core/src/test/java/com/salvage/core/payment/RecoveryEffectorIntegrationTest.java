package com.salvage.core.payment;

import static org.assertj.core.api.Assertions.assertThat;

import com.salvage.core.ingest.SalvageInfrastructure;
import com.salvage.core.ledger.repository.LedgerEntryRepository;
import com.salvage.core.model.Merchant;
import com.salvage.core.payment.model.PaymentState;
import com.salvage.core.payment.model.ProviderOperation;
import com.salvage.core.payment.repository.ProviderOperationRepository;
import com.salvage.core.payment.service.IdempotencyKeys;
import com.salvage.core.payment.service.RecoveryEffector;
import com.salvage.core.payment.simulated.SimulatedProvider;
import com.salvage.core.policy.model.RecoveryActionType;
import com.salvage.core.repository.MerchantRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The effector, against a real database and the simulated provider.
 *
 * <p>Configured so every provider call times out and every timed-out call
 * actually captured the money. That combination is rare in the wild and is the
 * one that bankrupts trust when it is mishandled, so it is the default here
 * rather than an edge case at the bottom of the file.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.NONE,
        // This class is about what the code below computes, not about the
        // gate in front of it. Authentication has its own tests in
        // com.salvage.core.api.auth; ApiAuthenticationTest is the one that
        // turns it on and proves a merchant key cannot read another tenant.
        properties = "salvage.auth.required=false")
@TestPropertySource(
        properties = {
            "salvage.payment.provider=simulated",
            "salvage.payment.simulated.seed=424242",
            // Every call times out, and every timeout really took the money.
            "salvage.payment.simulated.success-rate=0.0",
            "salvage.payment.simulated.timeout-rate=1.0",
            "salvage.payment.simulated.timeout-captured-rate=1.0"
        })
class RecoveryEffectorIntegrationTest extends SalvageInfrastructure {

    @Autowired private RecoveryEffector effector;
    @Autowired private ProviderOperationRepository operations;
    @Autowired private LedgerEntryRepository ledgerEntries;
    @Autowired private MerchantRepository merchants;
    @Autowired private PaymentProvider provider;
    @Autowired private TransactionTemplate transactionTemplate;

    private String registerMerchant() {
        String merchantId = "m_eff_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        transactionTemplate.executeWithoutResult(
                status -> merchants.save(new Merchant(merchantId, "Effector Test")));
        return merchantId;
    }

    @Test
    void the_default_provider_is_the_simulator_so_the_quickstart_needs_no_credentials() {
        assertThat(provider).isInstanceOf(SimulatedProvider.class);
        assertThat(provider.name()).isEqualTo("simulated");
    }

    @Test
    void a_timed_out_retry_is_recorded_as_indeterminate_and_never_as_failed() {
        String merchant = registerMerchant();

        RecoveryEffector.ExecutionResult result =
                effector.execute(
                        merchant, "pay_1", RecoveryActionType.RETRY_IMMEDIATE, null, 249900L, "INR", null,
                        "cust_1", 1);

        assertThat(result.outcome()).isEqualTo(RecoveryEffector.Outcome.INDETERMINATE);
        assertThat(result.providerState()).isEqualTo(PaymentState.UNKNOWN);

        List<ProviderOperation> rows =
                operations.findByMerchantIdAndPaymentAttemptIdOrderByStartedAtDesc(merchant, "pay_1");
        assertThat(rows).hasSize(1);
        // The row exists and says UNKNOWN. That is what a reconciliation sweep
        // needs in order to find it.
        assertThat(rows.get(0).getOutcomeState()).isEqualTo(PaymentState.UNKNOWN);
    }

    @Test
    void a_second_identical_execution_does_not_call_the_provider_again() {
        String merchant = registerMerchant();

        effector.execute(
                merchant, "pay_dup", RecoveryActionType.RETRY_IMMEDIATE, null, 100000L, "INR", null,
                "cust_1", 1);
        effector.execute(
                merchant, "pay_dup", RecoveryActionType.RETRY_IMMEDIATE, null, 100000L, "INR", null,
                "cust_1", 1);

        // One operation row, not two. The second call was answered from our
        // own record without touching the provider.
        assertThat(operations.findByMerchantIdAndPaymentAttemptIdOrderByStartedAtDesc(merchant, "pay_dup"))
                .hasSize(1);
    }

    @Test
    void a_deliberate_second_attempt_uses_a_different_key_and_is_a_separate_operation() {
        String merchant = registerMerchant();

        effector.execute(
                merchant, "pay_two", RecoveryActionType.RETRY_IMMEDIATE, null, 100000L, "INR", null,
                "cust_1", 1);
        effector.execute(
                merchant, "pay_two", RecoveryActionType.RETRY_IMMEDIATE, null, 100000L, "INR", null,
                "cust_1", 2);

        // Bumping the ordinal is the only way to make the provider act again,
        // which forces a caller who wants a second charge to say so.
        assertThat(operations.findByMerchantIdAndPaymentAttemptIdOrderByStartedAtDesc(merchant, "pay_two"))
                .hasSize(2);
    }

    @Test
    void reconciliation_blocks_a_retry_against_a_payment_that_already_captured() {
        String merchant = registerMerchant();

        // First call times out having actually captured. The system does not
        // know that yet.
        RecoveryEffector.ExecutionResult first =
                effector.execute(
                        merchant, "pay_recon", RecoveryActionType.RETRY_IMMEDIATE, null, 249900L, "INR",
                        null, "cust_1", 1);
        assertThat(first.outcome()).isEqualTo(RecoveryEffector.Outcome.INDETERMINATE);

        // Find the payment id the provider issued, which is what a
        // reconciliation sweep would have.
        String providerPaymentId =
                operations
                        .findByMerchantIdAndPaymentAttemptIdOrderByStartedAtDesc(merchant, "pay_recon")
                        .get(0)
                        .getProviderPaymentId();

        // Now a second attempt arrives, quoting that payment. Without the
        // guard this charges the customer twice.
        RecoveryEffector.ExecutionResult second =
                effector.execute(
                        merchant, "pay_recon", RecoveryActionType.RETRY_IMMEDIATE, providerPaymentId,
                        249900L, "INR", null, "cust_1", 2);

        assertThat(second.outcome()).isEqualTo(RecoveryEffector.Outcome.ALREADY_PAID);
        assertThat(second.providerState()).isEqualTo(PaymentState.CAPTURED);
    }

    @Test
    void a_blocked_retry_is_written_to_the_ledger() {
        String merchant = registerMerchant();

        effector.execute(
                merchant, "pay_led", RecoveryActionType.RETRY_IMMEDIATE, null, 249900L, "INR", null,
                "cust_1", 1);
        String providerPaymentId =
                operations
                        .findByMerchantIdAndPaymentAttemptIdOrderByStartedAtDesc(merchant, "pay_led")
                        .get(0)
                        .getProviderPaymentId();
        effector.execute(
                merchant, "pay_led", RecoveryActionType.RETRY_IMMEDIATE, providerPaymentId, 249900L,
                "INR", null, "cust_1", 2);

        // The refusal is auditable, not just logged. Someone asking six weeks
        // later why this payment was not retried gets an answer.
        assertThat(ledgerEntries.findByMerchantIdOrderByEntryIndexDesc(merchant, Limit.of(50)))
                .extracting(entry -> entry.getEventType())
                .contains("RETRY_BLOCKED_ALREADY_PAID");
    }

    @Test
    void no_action_touches_no_provider_and_writes_no_operation() {
        String merchant = registerMerchant();

        RecoveryEffector.ExecutionResult result =
                effector.execute(
                        merchant, "pay_noop", RecoveryActionType.NO_ACTION, null, 100000L, "INR", null,
                        "cust_1", 1);

        assertThat(result.outcome()).isEqualTo(RecoveryEffector.Outcome.NO_ACTION);
        assertThat(operations.findByMerchantIdAndPaymentAttemptIdOrderByStartedAtDesc(merchant, "pay_noop"))
                .isEmpty();
    }

    @Test
    void a_customer_nudge_creates_a_pending_link_and_is_not_reported_as_a_recovery() {
        String merchant = registerMerchant();

        RecoveryEffector.ExecutionResult result =
                effector.execute(
                        merchant, "pay_link", RecoveryActionType.CUSTOMER_NUDGE, null, 249900L, "INR",
                        null, "cust_1", 1);

        assertThat(result.outcome()).isEqualTo(RecoveryEffector.Outcome.LINK_CREATED);
        // PENDING. A link that exists is not a payment that happened, and
        // counting one as the other is how a recovery rate becomes fiction.
        assertThat(result.providerState()).isEqualTo(PaymentState.PENDING);

        List<ProviderOperation> rows =
                operations.findByMerchantIdAndPaymentAttemptIdOrderByStartedAtDesc(merchant, "pay_link");
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getOperation()).isEqualTo(ProviderOperation.Operation.PAYMENT_LINK);
        assertThat(rows.get(0).getProviderLinkId()).isNotBlank();
    }

    @Test
    void one_merchants_operations_are_invisible_to_another() {
        String owner = registerMerchant();
        String stranger = registerMerchant();
        effector.execute(
                owner, "pay_iso", RecoveryActionType.RETRY_IMMEDIATE, null, 100000L, "INR", null,
                "cust_1", 1);

        assertThat(
                        operations.findByMerchantIdAndPaymentAttemptIdOrderByStartedAtDesc(
                                stranger, "pay_iso"))
                .isEmpty();
    }

    @Test
    void the_idempotency_key_is_stable_across_processes() {
        // Derived, not generated. If this ever stops holding, a redelivered
        // command produces a new key and charges the customer again.
        String first = IdempotencyKeys.forOperation("m", "pay_1", "RETRY", 1);
        String second = IdempotencyKeys.forOperation("m", "pay_1", "RETRY", 1);
        String different = IdempotencyKeys.forOperation("m", "pay_1", "RETRY", 2);

        assertThat(first).isEqualTo(second).startsWith("slv_");
        assertThat(different).isNotEqualTo(first);
    }
}
