package com.salvage.core.health;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.DockerImageName;

/**
 * Integration test that dynamically provisions ephemeral containers when
 * a local Docker daemon is available (e.g. in CI runners).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIf("isDockerAvailable")
class HealthEndpointTestcontainersTest {

    static PostgreSQLContainer<?> postgres;
    static GenericContainer<?> redis;
    static KafkaContainer kafka;

    static boolean isDockerAvailable() {
        try {
            return DockerClientFactory.instance().isDockerAvailable();
        } catch (Throwable t) {
            return false;
        }
    }

    @BeforeAll
    static void startContainers() {
        if (isDockerAvailable()) {
            postgres = new PostgreSQLContainer<>(DockerImageName.parse("timescale/timescaledb:2.29.2-pg16")
                    .asCompatibleSubstituteFor("postgres"))
                    .withDatabaseName("salvage_test")
                    .withUsername("salvage")
                    .withPassword("test")
                    .withInitScript("testcontainers/init.sql")
                    .waitingFor(Wait.forListeningPort());
            postgres.start();

            redis = new GenericContainer<>(DockerImageName.parse("redis:7.4.11-bookworm"))
                    .withExposedPorts(6379)
                    .waitingFor(Wait.forLogMessage(".*Ready to accept connections.*", 1));
            redis.start();

            kafka = new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.9.0"))
                    .withKraft();
            kafka.start();
        }
    }

    @DynamicPropertySource
    static void overrideProperties(DynamicPropertyRegistry registry) {
        if (postgres != null && postgres.isRunning()) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl);
            registry.add("spring.datasource.username", postgres::getUsername);
            registry.add("spring.datasource.password", postgres::getPassword);
        }
        if (redis != null && redis.isRunning()) {
            registry.add("spring.data.redis.host", redis::getHost);
            registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
        }
        if (kafka != null && kafka.isRunning()) {
            registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
        }
    }

    @Autowired
    private TestRestTemplate restTemplate;

    @Test
    @SuppressWarnings("unchecked")
    void readiness_returns_healthy_with_testcontainers() {
        ResponseEntity<Map> response = restTemplate.getForEntity("/health/readiness", Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        Map<String, Object> body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("status")).isEqualTo("healthy");

        Map<String, Map<String, Object>> checks =
                (Map<String, Map<String, Object>>) body.get("checks");
        assertThat(checks).containsKeys("postgres", "redis", "kafka");
        assertThat(checks.get("postgres").get("status")).isEqualTo("up");
        assertThat(checks.get("redis").get("status")).isEqualTo("up");
        assertThat(checks.get("kafka").get("status")).isEqualTo("up");
    }
}
