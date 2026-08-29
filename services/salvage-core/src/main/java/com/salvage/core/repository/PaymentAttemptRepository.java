package com.salvage.core.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.repository.Repository;

import com.salvage.core.model.PaymentAttempt;

/**
 * Tenant-scoped access to payment attempts.
 *
 * <p>This deliberately extends Spring Data's bare {@link Repository} marker
 * rather than {@code JpaRepository}. {@code JpaRepository} would inherit
 * {@code findAll()}, {@code findById()}, {@code deleteAll()} and friends --
 * none of which take a merchant id. The architecture claims multi-tenant
 * isolation is enforced at the repository layer; inheriting a pile of
 * unscoped methods would make that claim false the moment anyone called one.
 *
 * <p>Every read declared here takes {@code merchantId} as its first argument.
 * If a query is needed that cannot be scoped by tenant, it does not belong on
 * this interface.
 */
public interface PaymentAttemptRepository extends Repository<PaymentAttempt, UUID> {

    PaymentAttempt save(PaymentAttempt attempt);

    /**
     * Lookup by the provider's attempt identifier within a tenant. The unique
     * constraint on {@code (merchant_id, payment_attempt_id)} guarantees at
     * most one result, which is also what makes redelivery of the same event
     * a no-op rather than a duplicate row.
     */
    Optional<PaymentAttempt> findByMerchantIdAndPaymentAttemptId(
            String merchantId, String paymentAttemptId);

    Optional<PaymentAttempt> findByMerchantIdAndId(String merchantId, UUID id);

    long countByMerchantId(String merchantId);
}
