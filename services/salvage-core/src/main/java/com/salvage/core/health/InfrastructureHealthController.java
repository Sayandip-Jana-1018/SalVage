package com.salvage.core.health;

import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.sql.DataSource;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Infrastructure health endpoint that actually round-trips every dependency.
 * <p>
 * This is deliberately <em>not</em> Spring Boot Actuator's default health
 * indicators, which report "UP" based on configuration existence rather than
 * a proven round-trip. A health check that doesn't touch the wire isn't a
 * health check.
 * <p>
 * The readiness endpoint returns 200 only when all three dependencies
 * (PostgreSQL, Redis, Kafka) respond successfully. A 503 means the process
 * is alive but should not receive traffic.
 */
@RestController
@RequestMapping("/health")
public class InfrastructureHealthController {

    private final DataSource dataSource;
    private final RedisConnectionFactory redisConnectionFactory;
    private final KafkaAdmin kafkaAdmin;
    private final String bootstrapServers;

    public InfrastructureHealthController(
            DataSource dataSource,
            RedisConnectionFactory redisConnectionFactory,
            KafkaAdmin kafkaAdmin,
            @Value("${spring.kafka.bootstrap-servers:localhost:19092}") String bootstrapServers) {
        this.dataSource = dataSource;
        this.redisConnectionFactory = redisConnectionFactory;
        this.kafkaAdmin = kafkaAdmin;
        this.bootstrapServers = bootstrapServers;
    }

    @GetMapping("/liveness")
    public ResponseEntity<Map<String, Object>> liveness() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "healthy");
        body.put("checks", Map.of());
        return ResponseEntity.ok(body);
    }

    @GetMapping("/readiness")
    public ResponseEntity<Map<String, Object>> readiness() {
        Map<String, Object> checks = new LinkedHashMap<>();
        boolean allHealthy = true;

        // ---- PostgreSQL ---------------------------------------------------
        checks.put("postgres", checkPostgres());
        if ("down".equals(((Map<?, ?>) checks.get("postgres")).get("status"))) {
            allHealthy = false;
        }

        // ---- Redis --------------------------------------------------------
        checks.put("redis", checkRedis());
        if ("down".equals(((Map<?, ?>) checks.get("redis")).get("status"))) {
            allHealthy = false;
        }

        // ---- Kafka --------------------------------------------------------
        checks.put("kafka", checkKafka());
        if ("down".equals(((Map<?, ?>) checks.get("kafka")).get("status"))) {
            allHealthy = false;
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", allHealthy ? "healthy" : "unhealthy");
        body.put("checks", checks);

        return allHealthy
                ? ResponseEntity.ok(body)
                : ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }

    private Map<String, Object> checkPostgres() {
        Instant start = Instant.now();
        try (var conn = dataSource.getConnection();
             var stmt = conn.createStatement();
             var rs = stmt.executeQuery("SELECT 1")) {
            rs.next();
            double latencyMs = Duration.between(start, Instant.now()).toNanos() / 1_000_000.0;
            return Map.of("status", "up", "latency_ms", latencyMs);
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            return Map.of("status", "down", "error", msg);
        }
    }

    private Map<String, Object> checkRedis() {
        Instant start = Instant.now();
        try (var conn = redisConnectionFactory.getConnection()) {
            String pong = conn.ping();
            double latencyMs = Duration.between(start, Instant.now()).toNanos() / 1_000_000.0;
            if ("PONG".equals(pong)) {
                return Map.of("status", "up", "latency_ms", latencyMs);
            }
            return Map.of("status", "down", "error", "unexpected ping response: " + pong);
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            return Map.of("status", "down", "error", msg);
        }
    }

    private Map<String, Object> checkKafka() {
        Instant start = Instant.now();
        Map<String, Object> config = new HashMap<>(kafkaAdmin.getConfigurationProperties());
        Object servers = config.get(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG);
        if (servers == null || (servers instanceof Collection<?> c && c.isEmpty()) || "".equals(servers)) {
            config.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        }
        config.put(AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, "10000");
        config.put(AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, "10000");
        try (AdminClient client = AdminClient.create(config)) {
            client.describeCluster().nodes().get(10, java.util.concurrent.TimeUnit.SECONDS);
            double latencyMs = Duration.between(start, Instant.now()).toNanos() / 1_000_000.0;
            return Map.of("status", "up", "latency_ms", latencyMs);
        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            return Map.of("status", "down", "error", msg);
        }
    }
}
