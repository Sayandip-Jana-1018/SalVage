package com.salvage.core.health;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.Objects;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * Integration test proving salvage-core connects to the live local
 * infrastructure (PostgreSQL, Redis, Redpanda) started via `docker compose up`.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class HealthEndpointLiveIntegrationTest {

    private static final ParameterizedTypeReference<Map<String, Object>> MAP_TYPE =
            new ParameterizedTypeReference<>() {};

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    @SuppressWarnings("unchecked")
    void readiness_returns_healthy_with_live_infra() {
        ResponseEntity<Map<String, Object>> response =
                restTemplate.exchange("/health/readiness", HttpMethod.GET, null, MAP_TYPE);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> body = Objects.requireNonNull(response.getBody());
        assertThat(body.get("status")).isEqualTo("healthy");

        Map<String, Map<String, Object>> checks =
                (Map<String, Map<String, Object>>) body.get("checks");
        assertThat(checks).isNotNull();
        assertThat(checks).containsKeys("postgres", "redis", "kafka");
        assertThat(checks.get("postgres").get("status")).isEqualTo("up");
        assertThat(checks.get("redis").get("status")).isEqualTo("up");
        assertThat(checks.get("kafka").get("status")).isEqualTo("up");
    }

    @Test
    void liveness_returns_200() {
        ResponseEntity<Map<String, Object>> response =
                restTemplate.exchange("/health/liveness", HttpMethod.GET, null, MAP_TYPE);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
