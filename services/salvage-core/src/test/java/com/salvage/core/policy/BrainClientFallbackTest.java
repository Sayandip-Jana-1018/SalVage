package com.salvage.core.policy;

import static org.assertj.core.api.Assertions.assertThat;

import com.salvage.core.policy.client.BrainClient;
import com.salvage.core.policy.model.PolicyDecisionResponse;
import com.salvage.core.policy.model.RecoveryActionType;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;

class BrainClientFallbackTest {

    @Test
    void unreachable_brain_gracefully_falls_back_to_fail_closed_noop() {
        // Point to an unreachable mock port
        BrainClient client = new BrainClient(new RestTemplateBuilder(), "http://localhost:59999");

        PolicyDecisionResponse decision = client.decide("m_test", "att_test_123");

        assertThat(decision).isNotNull();
        assertThat(decision.paymentAttemptId()).isEqualTo("att_test_123");
        assertThat(decision.chosenAction()).isEqualTo(RecoveryActionType.NO_ACTION);
        assertThat(decision.recoveryProbability()).isEqualTo(0.0);
        assertThat(decision.expectedNetValuePaise()).isEqualTo(0L);
        assertThat(decision.reasoningTokens()).contains("FAIL_CLOSED_NO_ACTION");
    }
}
