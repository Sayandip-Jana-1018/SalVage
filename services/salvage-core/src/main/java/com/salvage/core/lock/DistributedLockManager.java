package com.salvage.core.lock;

import java.time.Duration;
import java.util.Collections;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

/**
 * Distributed Lock Manager backed by Redis with atomic Lua release scripts
 * to prevent concurrent workers from processing the same customer or order.
 */
@Component
public class DistributedLockManager {

    private static final Logger log = LoggerFactory.getLogger(DistributedLockManager.class);

    private static final String RELEASE_LOCK_SCRIPT =
            "if redis.call('get', KEYS[1]) == ARGV[1] then " +
            "  return redis.call('del', KEYS[1]) " +
            "else " +
            "  return 0 " +
            "end";

    private final StringRedisTemplate redisTemplate;
    private final DefaultRedisScript<Long> releaseScript;

    public DistributedLockManager(StringRedisTemplate redisTemplate) {
        this.redisTemplate = Objects.requireNonNull(redisTemplate, "redisTemplate must not be null");
        this.releaseScript = new DefaultRedisScript<>(RELEASE_LOCK_SCRIPT, Long.class);
    }

    /**
     * Attempts to acquire a distributed lock for a customer with a specified lease duration.
     *
     * @param merchantId tenant identifier
     * @param customerId customer identifier
     * @param leaseDuration how long the lock remains valid before automatic expiration
     * @return an AutoCloseable DistributedLock, or null if the lock could not be acquired
     */
    public DistributedLock tryAcquireCustomerLock(String merchantId, String customerId, Duration leaseDuration) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(customerId, "customerId must not be null");
        Objects.requireNonNull(leaseDuration, "leaseDuration must not be null");

        String lockKey = String.format("lock:customer:%s:%s", merchantId, customerId);
        String lockToken = UUID.randomUUID().toString();

        try {
            Boolean acquired = redisTemplate.opsForValue().setIfAbsent(
                    Objects.requireNonNull(lockKey),
                    Objects.requireNonNull(lockToken),
                    leaseDuration);
            if (Boolean.TRUE.equals(acquired)) {
                log.debug("Acquired distributed lock {} token {}", lockKey, lockToken);
                return new DistributedLock(this, lockKey, lockToken);
            }
            log.debug("Failed to acquire distributed lock {}", lockKey);
            return null;
        } catch (Exception e) {
            log.warn("Redis error while acquiring lock {}, falling back to closed failure: {}", lockKey, e.getMessage());
            return null;
        }
    }

    /**
     * Atomically releases the distributed lock if the token matches.
     */
    public boolean releaseLock(String lockKey, String lockToken) {
        Objects.requireNonNull(lockKey, "lockKey must not be null");
        Objects.requireNonNull(lockToken, "lockToken must not be null");

        try {
            Long result = redisTemplate.execute(
                    releaseScript,
                    Collections.singletonList(lockKey),
                    lockToken);
            boolean released = result != null && result > 0;
            log.debug("Released distributed lock {} token {} (success={})", lockKey, lockToken, released);
            return released;
        } catch (Exception e) {
            log.warn("Redis error while releasing lock {}: {}", lockKey, e.getMessage());
            return false;
        }
    }

    /**
     * AutoCloseable handle for safe try-with-resources lock management.
     */
    public static class DistributedLock implements AutoCloseable {
        private final DistributedLockManager manager;
        private final String lockKey;
        private final String lockToken;
        private boolean closed = false;

        private DistributedLock(DistributedLockManager manager, String lockKey, String lockToken) {
            this.manager = manager;
            this.lockKey = lockKey;
            this.lockToken = lockToken;
        }

        public String getLockKey() {
            return lockKey;
        }

        public String getLockToken() {
            return lockToken;
        }

        @Override
        public void close() {
            if (!closed) {
                closed = true;
                manager.releaseLock(lockKey, lockToken);
            }
        }
    }
}
