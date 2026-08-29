package com.salvage.core.config;

import java.util.HashMap;
import java.util.Map;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Kafka beans that Spring Boot's autoconfiguration does not provide.
 */
@Configuration
public class KafkaConfig {

    /**
     * A shared {@link AdminClient} for health probing.
     *
     * <p>Spring Boot autoconfigures {@code KafkaAdmin}, which manages topic
     * creation, but does not expose a reusable {@code AdminClient}. Building
     * one per health check spawns a thread and a connection each time; with a
     * container health check polling every few seconds that adds up quickly.
     *
     * <p>Bootstrap servers are read from the same property the rest of the
     * application uses, so there is one place to configure the broker.
     */
    @Bean(destroyMethod = "close")
    public AdminClient kafkaAdminClient(
            @Value("${spring.kafka.bootstrap-servers}") String bootstrapServers) {
        Map<String, Object> config = new HashMap<>();
        config.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        config.put(AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, 5_000);
        config.put(AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, 5_000);
        // Without a bounded reconnect backoff a broker outage turns into a
        // tight reconnect loop from every instance at once.
        config.put(AdminClientConfig.RECONNECT_BACKOFF_MAX_MS_CONFIG, 10_000);
        return AdminClient.create(config);
    }
}
