package com.salvage.core.health;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * Unit tests for the readiness aggregation logic.
 *
 * <p>These use hand-written fake probes rather than mocks of DataSource,
 * RedisConnectionFactory and KafkaAdmin. The previous version of this test
 * mocked the infrastructure clients but left the Kafka path unmocked, so it
 * opened a real AdminClient against localhost and took ten seconds to fail --
 * a "unit" test whose result depended on whether the developer had run
 * `make up`. Probing behind an interface makes the aggregation logic testable
 * without any I/O at all.
 */
class InfrastructureHealthControllerTest {

    private static DependencyProbe up(String name) {
        return new DependencyProbe() {
            @Override
            public String name() {
                return name;
            }

            @Override
            public void probe() {
                // reachable
            }
        };
    }

    private static DependencyProbe down(String name, Exception failure) {
        return new DependencyProbe() {
            @Override
            public String name() {
                return name;
            }

            @Override
            public void probe() throws Exception {
                throw failure;
            }
        };
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Map<String, Object>> checksOf(
            ResponseEntity<Map<String, Object>> response) {
        Map<String, Object> body = Objects.requireNonNull(response.getBody());
        return (Map<String, Map<String, Object>>) body.get("checks");
    }

    @Test
    void liveness_is_200_and_touches_nothing() {
        var controller = new InfrastructureHealthController(List.of(
                down("postgres", new IllegalStateException("boom"))));

        ResponseEntity<Map<String, Object>> response = controller.liveness();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(Objects.requireNonNull(response.getBody()).get("status")).isEqualTo("healthy");
    }

    @Test
    void readiness_is_200_when_every_probe_succeeds() {
        var controller = new InfrastructureHealthController(
                List.of(up("postgres"), up("redis"), up("kafka")));

        ResponseEntity<Map<String, Object>> response = controller.readiness();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(Objects.requireNonNull(response.getBody()).get("status")).isEqualTo("healthy");
        assertThat(checksOf(response)).containsOnlyKeys("postgres", "redis", "kafka");
        assertThat(checksOf(response).get("postgres").get("status")).isEqualTo("up");
    }

    @Test
    void readiness_is_503_when_any_single_probe_fails() {
        var controller = new InfrastructureHealthController(List.of(
                up("postgres"),
                down("redis", new IllegalStateException("connection reset")),
                up("kafka")));

        ResponseEntity<Map<String, Object>> response = controller.readiness();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(Objects.requireNonNull(response.getBody()).get("status")).isEqualTo("unhealthy");
        assertThat(checksOf(response).get("redis").get("status")).isEqualTo("down");
        assertThat(checksOf(response).get("postgres").get("status")).isEqualTo("up");
    }

    @Test
    void readiness_reports_every_failing_probe_not_just_the_first() {
        var controller = new InfrastructureHealthController(List.of(
                down("postgres", new IllegalStateException("a")),
                down("redis", new IllegalStateException("b")),
                up("kafka")));

        ResponseEntity<Map<String, Object>> response = controller.readiness();

        assertThat(checksOf(response).get("postgres").get("status")).isEqualTo("down");
        assertThat(checksOf(response).get("redis").get("status")).isEqualTo("down");
    }

    /**
     * The endpoint is unauthenticated. Driver exception messages routinely
     * contain the JDBC URL, which contains the password. Leaking that to an
     * anonymous caller is a credential disclosure, so the body carries the
     * exception type and nothing else.
     */
    @Test
    void readiness_never_leaks_exception_messages() {
        String secret = "jdbc:postgresql://db/salvage?password=hunter2";
        var controller = new InfrastructureHealthController(List.of(
                down("postgres", new IllegalStateException(secret))));

        ResponseEntity<Map<String, Object>> response = controller.readiness();

        String rendered = Objects.requireNonNull(response.getBody()).toString();
        assertThat(rendered).doesNotContain("hunter2");
        assertThat(rendered).doesNotContain("jdbc:");
        assertThat(checksOf(response).get("postgres").get("reason"))
                .isEqualTo("IllegalStateException");
    }

    @Test
    void readiness_reports_non_negative_latency() {
        var controller = new InfrastructureHealthController(List.of(up("postgres")));

        ResponseEntity<Map<String, Object>> response = controller.readiness();

        assertThat((Double) checksOf(response).get("postgres").get("latency_ms"))
                .isGreaterThanOrEqualTo(0.0);
    }
}
