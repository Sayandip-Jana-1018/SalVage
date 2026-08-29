package com.salvage.core.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.salvage.core.model.PaymentAttempt;

@Repository
public interface PaymentAttemptRepository extends JpaRepository<PaymentAttempt, UUID> {

    /**
     * Tenant-scoped lookup by the provider's attempt identifier.
     * The unique constraint on (merchant_id, payment_attempt_id) in the
     * schema guarantees at most one result.
     */
    Optional<PaymentAttempt> findByMerchantIdAndPaymentAttemptId(
            String merchantId, String paymentAttemptId);
}
