package com.salvage.core.health;

import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.stereotype.Component;

/**
 * Round-trips a PING.
 *
 * <p>Note for readers who reach this from ADR-0004: Redis being down makes
 * this service report not-ready, but it does not make the service incorrect.
 * Readiness reflects "should this instance take traffic", and an instance
 * running without its cache would serve every request at the PostgreSQL
 * latency. Correctness is unaffected either way.
 */
@Component
public class RedisProbe implements DependencyProbe {

    private final RedisConnectionFactory connectionFactory;

    public RedisProbe(RedisConnectionFactory connectionFactory) {
        this.connectionFactory = connectionFactory;
    }

    @Override
    public String name() {
        return "redis";
    }

    @Override
    public void probe() {
        try (RedisConnection conn = connectionFactory.getConnection()) {
            String pong = conn.ping();
            if (!"PONG".equals(pong)) {
                throw new IllegalStateException("unexpected PING response");
            }
        }
    }
}
