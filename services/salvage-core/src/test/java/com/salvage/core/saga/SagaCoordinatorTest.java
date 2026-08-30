package com.salvage.core.saga;

import static org.assertj.core.api.Assertions.assertThat;

import com.salvage.core.ingest.SalvageInfrastructure;
import com.salvage.core.ledger.service.LedgerVerificationService;
import com.salvage.core.ledger.service.VerificationResult;
import com.salvage.core.model.Merchant;
import com.salvage.core.repository.MerchantRepository;
import com.salvage.core.saga.model.RecoverySagaRecord;
import com.salvage.core.saga.model.SagaState;
import com.salvage.core.saga.service.SagaCoordinator;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class SagaCoordinatorTest extends SalvageInfrastructure {

    @Autowired
    private SagaCoordinator sagaCoordinator;

    @Autowired
    private LedgerVerificationService ledgerVerificationService;

    @Autowired
    private MerchantRepository merchantRepository;

    private String merchantId;

    @BeforeEach
    void setUp() {
        merchantId = "m_saga_" + UUID.randomUUID().toString().substring(0, 8);
        merchantRepository.save(new Merchant(merchantId, "Saga Test Merchant"));
    }

    @Test
    void multi_step_recovery_saga_transitions_cleanly_and_records_in_ledger() {
        String paymentAttemptId = "att_saga_" + UUID.randomUUID();

        // 1. Start Saga
        RecoverySagaRecord saga = sagaCoordinator.startSaga(
                merchantId,
                paymentAttemptId,
                Map.of("amount", 100000L, "initial_rail", "issuer_alpha|UPI|RAZORPAY"));

        assertThat(saga.getCurrentState()).isEqualTo(SagaState.STARTED);
        assertThat(saga.getCurrentStep()).isEqualTo(0);

        // 2. Step 1: Retry Initiated
        RecoverySagaRecord step1 = sagaCoordinator.transitionStep(
                merchantId,
                saga.getSagaId(),
                SagaState.RETRY_INITIATED,
                Map.of("retry_rail", "issuer_alpha|UPI|RAZORPAY", "status", "ISSUER_UNAVAILABLE"));

        assertThat(step1.getCurrentState()).isEqualTo(SagaState.RETRY_INITIATED);
        assertThat(step1.getCurrentStep()).isEqualTo(1);

        // 3. Step 2: Rail Switch Initiated
        RecoverySagaRecord step2 = sagaCoordinator.transitionStep(
                merchantId,
                saga.getSagaId(),
                SagaState.RAIL_SWITCH_INITIATED,
                Map.of("new_rail", "issuer_beta|CARD|RAZORPAY", "status", "SUCCESS"));

        assertThat(step2.getCurrentState()).isEqualTo(SagaState.RAIL_SWITCH_INITIATED);
        assertThat(step2.getCurrentStep()).isEqualTo(2);

        // 4. Step 3: Completed
        RecoverySagaRecord completed = sagaCoordinator.transitionStep(
                merchantId,
                saga.getSagaId(),
                SagaState.COMPLETED,
                Map.of("final_status", "RECOVERED", "recovered_amount", 100000L));

        assertThat(completed.getCurrentState()).isEqualTo(SagaState.COMPLETED);
        assertThat(completed.getCurrentStep()).isEqualTo(3);

        // 5. Verify the entire cryptographic ledger chain for this merchant is valid
        VerificationResult verification = ledgerVerificationService.verifyChain(merchantId);
        assertThat(verification.isValid()).isTrue();
        assertThat(verification.verifiedEntriesCount()).isEqualTo(4); // Start + 3 steps
    }
}
