package com.salvage.core.chaos;

import static org.assertj.core.api.Assertions.assertThat;

import com.salvage.core.ingest.SalvageInfrastructure;
import com.salvage.core.lock.DistributedLockManager;
import com.salvage.core.lock.DistributedLockManager.DistributedLock;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.NONE,
        // This class is about what the code below computes, not about the
        // gate in front of it. Authentication has its own tests in
        // com.salvage.core.api.auth; ApiAuthenticationTest is the one that
        // turns it on and proves a merchant key cannot read another tenant.
        properties = "salvage.auth.required=false")
class CustomerLockChaosTest extends SalvageInfrastructure {

    @Autowired
    private DistributedLockManager lockManager;

    @Test
    void fifty_concurrent_workers_competing_on_same_customer_are_mutually_exclusive() throws InterruptedException {
        String merchantId = "m_lock_" + UUID.randomUUID().toString().substring(0, 8);
        String customerId = "cust_lock_" + UUID.randomUUID();

        int threads = 50;
        ExecutorService executor = Executors.newFixedThreadPool(threads);
        CountDownLatch startGate = new CountDownLatch(1);
        CountDownLatch endGate = new CountDownLatch(threads);

        AtomicInteger simultaneousLocksHeld = new AtomicInteger(0);
        AtomicInteger maxConcurrentObserved = new AtomicInteger(0);
        AtomicInteger successfulLockAcquisitions = new AtomicInteger(0);

        for (int i = 0; i < threads; i++) {
            executor.submit(() -> {
                try {
                    startGate.await();
                    try (DistributedLock lock = lockManager.tryAcquireCustomerLock(
                            merchantId, customerId, Duration.ofSeconds(5))) {
                        if (lock != null) {
                            successfulLockAcquisitions.incrementAndGet();
                            int current = simultaneousLocksHeld.incrementAndGet();
                            maxConcurrentObserved.updateAndGet(max -> Math.max(max, current));

                            // Hold lock for a brief critical section
                            try {
                                Thread.sleep(30);
                            } catch (InterruptedException ignored) {}

                            simultaneousLocksHeld.decrementAndGet();
                        }
                    }
                } catch (Exception ignored) {
                } finally {
                    endGate.countDown();
                }
            });
        }

        startGate.countDown();
        boolean completed = endGate.await(10, TimeUnit.SECONDS);
        executor.shutdown();

        assertThat(completed).isTrue();
        // INVARIANT: At most ONE worker could hold the distributed lock at any given instant
        assertThat(maxConcurrentObserved.get()).isEqualTo(1);
        assertThat(successfulLockAcquisitions.get()).isGreaterThanOrEqualTo(1);
    }
}
