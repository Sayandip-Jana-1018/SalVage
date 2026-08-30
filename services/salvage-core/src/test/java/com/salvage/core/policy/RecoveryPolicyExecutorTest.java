package com.salvage.core.policy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.salvage.core.ingest.SalvageInfrastructure;
import com.salvage.core.ledger.model.LedgerEntry;
import com.salvage.core.ledger.repository.LedgerEntryRepository;
import com.salvage.core.model.Merchant;
import com.salvage.core.policy.client.BrainClient;
import com.salvage.core.policy.model.PolicyDecisionResponse;
import com.salvage.core.policy.model.RecoveryActionType;
import com.salvage.core.policy.model.RecoveryDecisionRecord;
import com.salvage.core.policy.repository.RecoveryDecisionRepository;
import com.salvage.core.policy.service.RecoveryPolicyExecutor;
import com.salvage.core.repository.MerchantRepository;
import com.salvage.core.saga.model.RecoverySagaRecord;
import com.salvage.core.saga.model.SagaState;
import com.salvage.core.saga.repository.RecoverySagaRepository;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
class RecoveryPolicyExecutorTest extends SalvageInfrastructure {

    @MockitoBean
    private BrainClient brainClient;

    @Autowired
    private RecoveryPolicyExecutor policyExecutor;

    @Autowired
    private RecoveryDecisionRepository decisionRepository;

    @Autowired
    private RecoverySagaRepository sagaRepository;

    @Autowired
    private LedgerEntryRepository ledgerRepository;

    @Autowired
    private MerchantRepository merchantRepository;

    private String merchantId;

    @BeforeEach
    void setUp() {
        merchantId = "m_" + UUID.randomUUID().toString().substring(0, 8);
        merchantRepository.save(new Merchant(merchantId, "Policy Executor Test Merchant"));
    }

    @Test
    void permitted_rail_switch_decision_initiates_saga_and_ledger_entry() {
        String attemptId = "att_" + UUID.randomUUID().toString().substring(0, 8);
        String customerId = "cust_perm_1";

        PolicyDecisionResponse brainDecision = new PolicyDecisionResponse(
                attemptId,
                RecoveryActionType.SWITCH_RAIL,
                0.85,
                150000L,
                "ICICI|UPI|RAZORPAY",
                null,
                null,
                List.of("SYSTEMIC_OUTAGE_CORROBORATED", "SWITCH_RAIL_HEALTHY"),
                Instant.now());

        when(brainClient.decide(anyString(), anyString())).thenReturn(brainDecision);

        RecoveryDecisionRecord decision = policyExecutor.processRecoveryDecision(
                merchantId,
                attemptId,
                customerId,
                1, // attempt 1 of 3 (permitted)
                "HDFC|UPI|RAZORPAY",
                ZoneId.of("Asia/Kolkata"));

        assertThat(decision).isNotNull();
        assertThat(decision.getBoundsEvaluationStatus()).isEqualTo("PERMITTED");
        assertThat(decision.getSagaId()).isNotNull();

        UUID decisionId = Objects.requireNonNull(decision.getId());
        UUID sagaId = Objects.requireNonNull(decision.getSagaId());

        // Verify Decision persistence. Read back through the tenant-scoped
        // query rather than findById: the repository deliberately exposes no
        // unscoped lookup, because a decision is a record of what was done
        // with one merchant's money and reading one without naming the
        // merchant is not a query this application should be able to express.
        RecoveryDecisionRecord persistedDecision =
                decisionRepository
                        .findByMerchantIdAndPaymentAttemptIdOrderByCreatedAtDesc(merchantId, attemptId)
                        .stream()
                        .filter(record -> decisionId.equals(record.getId()))
                        .findFirst()
                        .orElseThrow();
        assertThat(persistedDecision.getChosenAction()).isEqualTo(RecoveryActionType.SWITCH_RAIL);
        assertThat(persistedDecision.getExpectedNetValuePaise()).isEqualTo(150000L);

        // Verify Saga creation
        // decision.getSagaId() holds the saga row's primary key, not its
        // business saga_id -- recovery_decisions.saga_id is a foreign key onto
        // recovery_sagas.id. Resolving it through findByMerchantIdAndSagaId
        // would silently find nothing.
        RecoverySagaRecord saga =
                sagaRepository.findByMerchantIdAndId(merchantId, sagaId).orElseThrow();
        assertThat(saga.getCurrentState()).isEqualTo(SagaState.RAIL_SWITCH_INITIATED);
        assertThat(saga.getMerchantId()).isEqualTo(merchantId);

        // Verify Immutable Ledger entries
        List<LedgerEntry> entries = ledgerRepository.findAllByMerchantIdOrderByEntryIndexAsc(merchantId);
        assertThat(entries).isNotEmpty();
        assertThat(entries).anyMatch(e -> e.getEventType().equals("DECISION_PERMITTED"));
    }

    @Test
    void attempt_cap_exhaustion_strictly_rejects_recovery_and_records_audit_with_no_saga() {
        String attemptId = "att_" + UUID.randomUUID().toString().substring(0, 8);
        String customerId = "cust_cap_1";

        PolicyDecisionResponse brainDecision = new PolicyDecisionResponse(
                attemptId,
                RecoveryActionType.RETRY_IMMEDIATE,
                0.80,
                100000L,
                null,
                null,
                null,
                List.of("TRANSIENT_GATEWAY_TIMEOUT"),
                Instant.now());

        when(brainClient.decide(anyString(), anyString())).thenReturn(brainDecision);

        RecoveryDecisionRecord decision = policyExecutor.processRecoveryDecision(
                merchantId,
                attemptId,
                customerId,
                3, // attempt count = 3 -> rejected by AttemptCapGuard
                "HDFC|UPI|RAZORPAY",
                ZoneId.of("Asia/Kolkata"));

        assertThat(decision).isNotNull();
        assertThat(decision.getBoundsEvaluationStatus()).isEqualTo("REJECTED");
        assertThat(decision.getBoundsRejectionReason()).contains("AttemptCapGuard");
        assertThat(decision.getSagaId()).isNull();

        // Zero sagas created
        Optional<RecoverySagaRecord> sagaOpt = sagaRepository.findByMerchantIdAndPaymentAttemptId(merchantId, attemptId);
        assertThat(sagaOpt).isEmpty();

        // Ledger audit records the rejection
        List<LedgerEntry> entries = ledgerRepository.findAllByMerchantIdOrderByEntryIndexAsc(merchantId);
        assertThat(entries).anyMatch(e -> e.getEventType().equals("BOUNDS_REJECTED"));
    }
}
