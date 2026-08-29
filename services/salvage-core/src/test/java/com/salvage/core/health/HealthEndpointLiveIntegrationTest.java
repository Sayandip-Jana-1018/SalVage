package com.salvage.core.health;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * Integration test proving salvage-core connects to the live local
 * infrastructure (PostgreSQL, Redis, Redpanda) started via `docker compose up`.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HealthEndpointLiveIntegrationTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    @SuppressWarnings("unchecked")
    void readiness_returns_healthy_with_live_infra() {
        ResponseEntity<Map> response = restTemplate.getForEntity("/health/readiness", Map.class);
        Map<String, Object> body = response.getBody();
        System.out.println(">>> Health check response status: " + response.getStatusCode() + ", body: " + body);

        assertThat(body).isNotNull();
        Map<String, Map<String, Object>> checks =
                (Map<String, Map<String, Object>>) body.get("checks");
        assertThat(checks).isNotNull();

        assertThat(response.getStatusCode())
                .withFailMessage("Expected 200 OK but was %s with checks: %s", response.getStatusCode(), checks)
                .isEqualTo(HttpStatus.OK);
        assertThat(body.get("status")).isEqualTo("healthy");

        assertThat(checks).containsKeys("postgres", "redis", "kafka");
        assertThat(checks.get("postgres").get("status")).isEqualTo("up");
        assertThat(checks.get("redis").get("status")).isEqualTo("up");
        assertThat(checks.get("kafka").get("status")).isEqualTo("up");
    }

    @Test
    void liveness_returns_200() {
        ResponseEntity<Map> response = restTemplate.getForEntity("/health/liveness", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
