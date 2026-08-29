package com.salvage.core.health;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Health endpoints that actually round-trip every dependency.
 *
 * <p>This is deliberately not Spring Boot Actuator's default health
 * indicators, several of which report UP based on a bean existing rather than
 * on a proven round trip.
 *
 * <p><strong>The response body carries no exception detail.</strong> A
 * failing dependency reports its exception type and nothing more. Driver
 * exception messages routinely embed the JDBC URL, which embeds credentials,
 * and this endpoint is unauthenticated. The full detail goes to the log,
 * where it is useful and not publicly readable.
 */
@RestController
@RequestMapping("/health")
public class InfrastructureHealthController {

    private static final Logger log = LoggerFactory.getLogger(InfrastructureHealthController.class);

    private final List<DependencyProbe> probes;

    public InfrastructureHealthController(List<DependencyProbe> probes) {
        this.probes = probes;
    }

    /** Is the process alive? Deliberately touches nothing downstream. */
    @GetMapping("/liveness")
    public ResponseEntity<Map<String, Object>> liveness() {
        return ResponseEntity.ok(Map.of("status", "healthy", "checks", Map.of()));
    }

    /** Can the process reach everything it needs to serve traffic? */
    @GetMapping("/readiness")
    public ResponseEntity<Map<String, Object>> readiness() {
        Map<String, Object> checks = new LinkedHashMap<>();
        boolean allHealthy = true;

        for (DependencyProbe probe : probes) {
            Map<String, Object> result = run(probe);
            checks.put(probe.name(), result);
            if (!"up".equals(result.get("status"))) {
                allHealthy = false;
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", allHealthy ? "healthy" : "unhealthy");
        body.put("checks", checks);

        return allHealthy
                ? ResponseEntity.ok(body)
                : ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }

    private Map<String, Object> run(DependencyProbe probe) {
        long startNanos = System.nanoTime();
        try {
            probe.probe();
            return Map.of("status", "up", "latency_ms", elapsedMillis(startNanos));
        } catch (Exception e) {
            log.warn("Readiness probe '{}' failed after {} ms",
                    probe.name(), elapsedMillis(startNanos), e);
            return Map.of(
                    "status", "down",
                    "latency_ms", elapsedMillis(startNanos),
                    "reason", e.getClass().getSimpleName());
        }
    }

    /**
     * Durations come from {@code System.nanoTime}, which is monotonic.
     * {@code Instant.now()} is wall clock and can step backwards across an NTP
     * correction, producing negative latencies in the health output.
     */
    private double elapsedMillis(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000.0;
    }
}
