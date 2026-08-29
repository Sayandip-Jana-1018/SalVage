package com.salvage.core.policy.client;

import com.salvage.core.policy.model.PolicyDecisionResponse;
import com.salvage.core.policy.model.RecoveryActionType;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

/**
 * Resilient REST client connecting salvage-core to salvage-brain for policy decision evaluation.
 */
@Component
public class BrainClient {

    private static final Logger log = LoggerFactory.getLogger(BrainClient.class);

    private final RestTemplate restTemplate;
    private final String baseUrl;

    public BrainClient(
            RestTemplateBuilder builder,
            @Value("${salvage.brain.base-url:http://localhost:8000}") String baseUrl) {
        this.baseUrl = Objects.requireNonNull(baseUrl, "baseUrl must not be null");
        this.restTemplate = builder
                .connectTimeout(Duration.ofMillis(2000))
                .readTimeout(Duration.ofMillis(3000))
                .build();
    }

    /**
     * Calls salvage-brain /v1/decide to obtain an optimal recovery decision.
     * Falls back to fail-closed NO_ACTION if the brain is unreachable or degraded.
     */
    public PolicyDecisionResponse decide(String merchantId, String paymentAttemptId) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(paymentAttemptId, "paymentAttemptId must not be null");

        String endpoint = baseUrl + "/v1/decide";
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, String> requestBody = Map.of(
                "merchant_id", merchantId,
                "payment_attempt_id", paymentAttemptId);

        HttpEntity<Map<String, String>> request = new HttpEntity<>(requestBody, headers);

        try {
            ResponseEntity<PolicyDecisionResponse> response = restTemplate.postForEntity(
                    endpoint,
                    request,
                    PolicyDecisionResponse.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                return response.getBody();
            }
            log.warn("Brain responded with non-2xx status {} for attempt {}", response.getStatusCode(), paymentAttemptId);
            return fallbackDecision(paymentAttemptId, "BRAIN_NON_2XX_STATUS");
        } catch (Exception e) {
            log.warn("Failed to reach salvage-brain at {} for attempt {}: {}. Failing closed.",
                    endpoint, paymentAttemptId, e.getMessage());
            return fallbackDecision(paymentAttemptId, "BRAIN_UNREACHABLE_FALLBACK");
        }
    }

    private PolicyDecisionResponse fallbackDecision(String paymentAttemptId, String reason) {
        return new PolicyDecisionResponse(
                paymentAttemptId,
                RecoveryActionType.NO_ACTION,
                0.0,
                0L,
                null,
                null,
                null,
                List.of(reason, "FAIL_CLOSED_NO_ACTION"),
                Instant.now());
    }
}
