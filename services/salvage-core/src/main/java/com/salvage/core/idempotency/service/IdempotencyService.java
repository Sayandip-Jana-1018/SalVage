package com.salvage.core.idempotency.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.salvage.core.idempotency.exception.ConcurrentOperationException;
import com.salvage.core.idempotency.model.IdempotencyRecord;
import com.salvage.core.idempotency.model.IdempotencyStatus;
import com.salvage.core.idempotency.repository.IdempotencyRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Multi-tier idempotency engine.
 * Fast-path sub-millisecond lookups in Redis + durable fallback in PostgreSQL.
 */
@Service
public class IdempotencyService {

    private static final Logger log = LoggerFactory.getLogger(IdempotencyService.class);
    private static final Duration IN_PROGRESS_TTL = Duration.ofMinutes(5);

    private final StringRedisTemplate redisTemplate;
    private final IdempotencyRepository idempotencyRepository;
    private final ObjectMapper objectMapper;

    public IdempotencyService(
            StringRedisTemplate redisTemplate,
            IdempotencyRepository idempotencyRepository,
            ObjectMapper objectMapper) {
        this.redisTemplate = Objects.requireNonNull(redisTemplate, "redisTemplate must not be null");
        this.idempotencyRepository = Objects.requireNonNull(idempotencyRepository, "idempotencyRepository must not be null");
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper must not be null");
    }

    private String redisKey(String merchantId, String idempotencyKey) {
        return String.format("idempotency:%s:%s", merchantId, idempotencyKey);
    }

    /**
     * Executes a transactional money operation with strict idempotency guarantees.
     */
    @Transactional
    public <T> T executeIdempotent(
            String merchantId,
            String idempotencyKey,
            Duration completedTtl,
            Class<T> returnType,
            Supplier<T> operation) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(idempotencyKey, "idempotencyKey must not be null");
        Objects.requireNonNull(completedTtl, "completedTtl must not be null");
        Objects.requireNonNull(returnType, "returnType must not be null");
        Objects.requireNonNull(operation, "operation must not be null");

        String cacheKey = redisKey(merchantId, idempotencyKey);

        // 1. Check Redis Cache
        try {
            String cached = redisTemplate.opsForValue().get(Objects.requireNonNull(cacheKey));
            if (cached != null) {
                if ("IN_PROGRESS".equals(cached)) {
                    throw new ConcurrentOperationException(
                            "Idempotent operation currently in-progress for key: " + idempotencyKey);
                }
                log.debug("Idempotency cache hit (Redis) for key {}", idempotencyKey);
                return objectMapper.readValue(cached, returnType);
            }
        } catch (ConcurrentOperationException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Redis read error for key {}, falling back to DB: {}", cacheKey, e.getMessage());
        }

        // 2. Check Database Fallback
        Optional<IdempotencyRecord> dbRecordOpt =
                idempotencyRepository.findByMerchantIdAndIdempotencyKey(merchantId, idempotencyKey);

        if (dbRecordOpt.isPresent()) {
            IdempotencyRecord record = dbRecordOpt.get();
            if (record.getStatus() == IdempotencyStatus.IN_PROGRESS) {
                throw new ConcurrentOperationException(
                        "Idempotent operation currently in-progress in DB for key: " + idempotencyKey);
            }
            if (record.getStatus() == IdempotencyStatus.COMPLETED && record.getResponsePayload() != null) {
                log.debug("Idempotency DB hit for key {}", idempotencyKey);
                try {
                    // Populate Redis cache
                    String payload = Objects.requireNonNull(record.getResponsePayload());
                    redisTemplate.opsForValue().set(Objects.requireNonNull(cacheKey), payload, completedTtl);
                    return objectMapper.readValue(payload, returnType);
                } catch (JsonProcessingException e) {
                    throw new IllegalStateException("Failed to deserialize cached idempotency payload", e);
                }
            }
        }

        // 3. Mark IN_PROGRESS in Redis
        try {
            Boolean set = redisTemplate.opsForValue().setIfAbsent(Objects.requireNonNull(cacheKey), "IN_PROGRESS", Objects.requireNonNull(IN_PROGRESS_TTL));
            if (Boolean.FALSE.equals(set)) {
                throw new ConcurrentOperationException(
                        "Concurrent operation detected on key: " + idempotencyKey);
            }
        } catch (ConcurrentOperationException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Redis lock set failed for key {}, proceeding with DB: {}", cacheKey, e.getMessage());
        }

        // 4. Mark IN_PROGRESS in DB
        Instant now = Instant.now();
        Instant expiresAt = now.plus(completedTtl);
        IdempotencyRecord dbRecord = dbRecordOpt.orElseGet(() ->
                new IdempotencyRecord(
                        merchantId,
                        idempotencyKey,
                        IdempotencyStatus.IN_PROGRESS,
                        null,
                        now,
                        now,
                        expiresAt));
        dbRecord.setStatus(IdempotencyStatus.IN_PROGRESS);
        idempotencyRepository.save(dbRecord);

        // 5. Execute Business Operation
        T result;
        try {
            result = operation.get();
        } catch (Exception e) {
            log.error("Operation failed for idempotency key {}: {}", idempotencyKey, e.getMessage());
            dbRecord.setStatus(IdempotencyStatus.FAILED);
            idempotencyRepository.save(dbRecord);
            try {
                redisTemplate.delete(Objects.requireNonNull(cacheKey));
            } catch (Exception re) {
                log.warn("Failed to delete Redis key {}: {}", cacheKey, re.getMessage());
            }
            throw e;
        }

        // 6. Serialize and Store COMPLETED result
        try {
            String jsonResult = objectMapper.writeValueAsString(result);
            dbRecord.setStatus(IdempotencyStatus.COMPLETED);
            dbRecord.setResponsePayload(jsonResult);
            idempotencyRepository.save(dbRecord);

            try {
                redisTemplate.opsForValue().set(Objects.requireNonNull(cacheKey), Objects.requireNonNull(jsonResult), completedTtl);
            } catch (Exception re) {
                log.warn("Failed to cache completed result in Redis for key {}: {}", cacheKey, re.getMessage());
            }

            return result;
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize idempotency result", e);
        }
    }
}
