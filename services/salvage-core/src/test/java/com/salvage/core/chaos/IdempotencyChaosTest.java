package com.salvage.core.chaos;

import static org.assertj.core.api.Assertions.assertThat;

import com.salvage.core.idempotency.exception.ConcurrentOperationException;
import com.salvage.core.idempotency.service.IdempotencyService;
import com.salvage.core.ingest.SalvageInfrastructure;
import com.salvage.core.model.Merchant;
import com.salvage.core.repository.MerchantRepository;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.NONE,
        // This class is about what the code below computes, not about the
        // gate in front of it. Authentication has its own tests in
        // com.salvage.core.api.auth; ApiAuthenticationTest is the one that
        // turns it on and proves a merchant key cannot read another tenant.
        properties = "salvage.auth.required=false")
class IdempotencyChaosTest extends SalvageInfrastructure {

    @Autowired
    private IdempotencyService idempotencyService;

    @Autowired
    private MerchantRepository merchantRepository;

    @Autowired
    private StringRedisTemplate redisTemplate;

    private String merchantId;

    @BeforeEach
    void setUp() {
        merchantId = "m_idem_chaos_" + UUID.randomUUID().toString().substring(0, 8);
        merchantRepository.save(new Merchant(merchantId, "Idempotency Chaos Merchant"));
    }

    public static class PaymentResult {
        public String status;
        public String transactionId;
        public long amount;

        public PaymentResult() {}

        public PaymentResult(String status, String transactionId, long amount) {
            this.status = status;
            this.transactionId = transactionId;
            this.amount = amount;
        }
    }

    @Test
    void fifty_concurrent_requests_with_same_idempotency_key_execute_exactly_once() throws InterruptedException {
        String idempotencyKey = "idem_key_" + UUID.randomUUID();
        int threads = 50;
        ExecutorService executor = Executors.newFixedThreadPool(threads);
        CountDownLatch startGate = new CountDownLatch(1);
        CountDownLatch endGate = new CountDownLatch(threads);

        AtomicInteger executionCount = new AtomicInteger(0);
        List<PaymentResult> successfulResults = Collections.synchronizedList(new ArrayList<>());
        List<Exception> exceptions = Collections.synchronizedList(new ArrayList<>());

        for (int i = 0; i < threads; i++) {
            executor.submit(() -> {
                try {
                    startGate.await();
                    PaymentResult res = idempotencyService.executeIdempotent(
                            merchantId,
                            idempotencyKey,
                            Duration.ofHours(24),
                            PaymentResult.class,
                            () -> {
                                // Simulate money operation latency
                                try {
                                    Thread.sleep(50);
                                } catch (InterruptedException ignored) {}
                                executionCount.incrementAndGet();
                                return new PaymentResult("CHARGED", "tx_" + idempotencyKey, 50000L);
                            });
                    successfulResults.add(res);
                } catch (ConcurrentOperationException e) {
                    // Valid fail-closed response for in-progress concurrent request
                    exceptions.add(e);
                } catch (Exception e) {
                    exceptions.add(e);
                } finally {
                    endGate.countDown();
                }
            });
        }

        startGate.countDown();
        boolean completed = endGate.await(10, TimeUnit.SECONDS);
        executor.shutdown();

        assertThat(completed).isTrue();
        // INVARIANT 1: Exactly one execution occurs
        assertThat(executionCount.get()).isEqualTo(1);

        // INVARIANT 2: All successful callers received identical transaction details
        assertThat(successfulResults).isNotEmpty();
        for (PaymentResult res : successfulResults) {
            assertThat(res.status).isEqualTo("CHARGED");
            assertThat(res.transactionId).isEqualTo("tx_" + idempotencyKey);
            assertThat(res.amount).isEqualTo(50000L);
        }
    }

    @Test
    void subsequent_calls_after_redis_cache_eviction_fall_back_to_durable_postgres_store() {
        String idempotencyKey = "idem_key_evicted_" + UUID.randomUUID();
        AtomicInteger executionCount = new AtomicInteger(0);

        PaymentResult first = idempotencyService.executeIdempotent(
                merchantId,
                idempotencyKey,
                Duration.ofHours(24),
                PaymentResult.class,
                () -> {
                    executionCount.incrementAndGet();
                    return new PaymentResult("CHARGED", "tx_fallback_1", 25000L);
                });

        assertThat(first.transactionId).isEqualTo("tx_fallback_1");
        assertThat(executionCount.get()).isEqualTo(1);

        // Manually evict Redis cache
        redisTemplate.delete("idempotency:" + merchantId + ":" + idempotencyKey);

        // Second call should hit durable PostgreSQL table and NOT re-execute
        PaymentResult second = idempotencyService.executeIdempotent(
                merchantId,
                idempotencyKey,
                Duration.ofHours(24),
                PaymentResult.class,
                () -> {
                    executionCount.incrementAndGet();
                    return new PaymentResult("CHARGED", "tx_fallback_2", 25000L);
                });

        assertThat(second.transactionId).isEqualTo("tx_fallback_1");
        assertThat(executionCount.get()).isEqualTo(1); // Zero re-execution
    }
}
