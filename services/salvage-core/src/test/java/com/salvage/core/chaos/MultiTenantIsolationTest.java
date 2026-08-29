package com.salvage.core.chaos;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.salvage.core.ingest.SalvageInfrastructure;
import com.salvage.core.ledger.model.LedgerEntry;
import com.salvage.core.ledger.repository.LedgerEntryRepository;
import com.salvage.core.ledger.service.LedgerService;
import com.salvage.core.model.FailureEvent;
import com.salvage.core.model.Merchant;
import com.salvage.core.model.PaymentAttempt;
import com.salvage.core.repository.FailureEventRepository;
import com.salvage.core.repository.MerchantRepository;
import com.salvage.core.repository.PaymentAttemptRepository;
import com.salvage.core.saga.model.RecoverySagaRecord;
import com.salvage.core.saga.model.SagaState;
import com.salvage.core.saga.repository.RecoverySagaRepository;
import com.salvage.core.saga.service.SagaCoordinator;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class MultiTenantIsolationTest extends SalvageInfrastructure {

    @Autowired
    private MerchantRepository merchantRepository;

    @Autowired
    private PaymentAttemptRepository attemptRepository;

    @Autowired
    private FailureEventRepository failureEventRepository;

    @Autowired
    private LedgerService ledgerService;

    @Autowired
    private LedgerEntryRepository ledgerRepository;

    @Autowired
    private SagaCoordinator sagaCoordinator;

    @Autowired
    private RecoverySagaRepository sagaRepository;

    @Autowired
    private TransactionTemplate transactionTemplate;

    private String tenantA;
    private String tenantB;

    @BeforeEach
    void setUp() {
        tenantA = "m_tenant_a_" + UUID.randomUUID().toString().substring(0, 8);
        tenantB = "m_tenant_b_" + UUID.randomUUID().toString().substring(0, 8);

        merchantRepository.save(new Merchant(tenantA, "Tenant A Merchant"));
        merchantRepository.save(new Merchant(tenantB, "Tenant B Merchant"));
    }

    @Test
    void ledger_entries_are_strictly_isolated_between_tenants() {
        transactionTemplate.execute(status -> {
            ledgerService.append(tenantA, "ORDER", "ord_a_1", "ORDER_CREATED", "{\"amount\": 100}");
            ledgerService.append(tenantA, "ORDER", "ord_a_2", "ORDER_CREATED", "{\"amount\": 200}");
            ledgerService.append(tenantB, "ORDER", "ord_b_1", "ORDER_CREATED", "{\"amount\": 300}");
            return null;
        });

        List<LedgerEntry> entriesA = ledgerRepository.findAllByMerchantIdOrderByEntryIndexAsc(tenantA);
        List<LedgerEntry> entriesB = ledgerRepository.findAllByMerchantIdOrderByEntryIndexAsc(tenantB);

        assertThat(entriesA).hasSize(2);
        assertThat(entriesA).allMatch(e -> e.getMerchantId().equals(tenantA));

        assertThat(entriesB).hasSize(1);
        assertThat(entriesB).allMatch(e -> e.getMerchantId().equals(tenantB));
    }

    @Test
    void payment_attempts_for_one_tenant_are_invisible_to_another() {
        String sharedAttemptId = "att_shared_id_1";

        PaymentAttempt attemptA = new PaymentAttempt(
                tenantA, "ord_100", sharedAttemptId, 50000L, "INR",
                "upi", "simulated", "issuer_alpha", "cust_1", false, null, "{}");
        PaymentAttempt attemptB = new PaymentAttempt(
                tenantB, "ord_200", sharedAttemptId, 75000L, "INR",
                "card", "simulated", "issuer_beta", "cust_2", false, null, "{}");

        attemptRepository.save(attemptA);
        attemptRepository.save(attemptB);

        // Tenant A lookup must only find tenant A's attempt
        PaymentAttempt foundA = attemptRepository.findByMerchantIdAndPaymentAttemptId(tenantA, sharedAttemptId)
                .orElseThrow();
        assertThat(foundA.getMerchantId()).isEqualTo(tenantA);
        assertThat(foundA.getAmountPaise()).isEqualTo(50000L);

        // Tenant B lookup must only find tenant B's attempt
        PaymentAttempt foundB = attemptRepository.findByMerchantIdAndPaymentAttemptId(tenantB, sharedAttemptId)
                .orElseThrow();
        assertThat(foundB.getMerchantId()).isEqualTo(tenantB);
        assertThat(foundB.getAmountPaise()).isEqualTo(75000L);
    }

    @Test
    void cross_tenant_foreign_key_reference_is_rejected_at_database_schema_level() {
        // Attempt created in Tenant A
        PaymentAttempt attemptA = new PaymentAttempt(
                tenantA, "ord_cross_1", "att_cross_1", 50000L, "INR",
                "upi", "simulated", "issuer_alpha", "cust_1", false, null, "{}");
        PaymentAttempt savedA = attemptRepository.save(attemptA);

        // Trying to insert a failure_event under Tenant B that references Tenant A's attempt UUID
        // MUST fail with composite foreign key violation fk_failure_events_attempt (payment_attempt_id, merchant_id)
        assertThatThrownBy(() -> {
            transactionTemplate.execute(status -> {
                failureEventRepository.save(new FailureEvent(
                        tenantB, // Cross-tenant!
                        UUID.randomUUID(),
                        savedA.getId(),
                        "BAD_REQUEST",
                        "Invalid cross-tenant attempt reference",
                        "issuer_alpha|upi|simulated",
                        Instant.now()));
                return null;
            });
        }).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void saga_states_are_partitioned_by_merchant_id() {
        RecoverySagaRecord sagaA = sagaCoordinator.startSaga(
                tenantA, "att_saga_tenant_a", Map.of("order", "a"));

        // Tenant B should not find or be able to transition Tenant A's saga
        assertThat(sagaRepository.findByMerchantIdAndSagaId(tenantB, sagaA.getSagaId())).isEmpty();

        assertThatThrownBy(() -> {
            sagaCoordinator.transitionStep(tenantB, sagaA.getSagaId(), SagaState.RETRY_INITIATED, Map.of());
        }).isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("Saga not found");
    }
}
