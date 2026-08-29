package com.salvage.core.health;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.admin.AdminClient;
import org.springframework.stereotype.Component;

/**
 * Describes the cluster to prove the broker is reachable.
 *
 * <p>The {@link AdminClient} is a singleton injected here rather than created
 * per request. Creating one per call opens connections and starts a background
 * thread each time; with a container health check polling every few seconds
 * that is a steady leak of both.
 */
@Component
public class KafkaProbe implements DependencyProbe {

    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    private final AdminClient adminClient;

    public KafkaProbe(AdminClient adminClient) {
        this.adminClient = adminClient;
    }

    @Override
    public String name() {
        return "kafka";
    }

    @Override
    public void probe() throws Exception {
        adminClient.describeCluster()
                .nodes()
                .get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
    }
}
