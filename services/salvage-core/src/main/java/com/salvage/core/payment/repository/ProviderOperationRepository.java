package com.salvage.core.payment.repository;

import com.salvage.core.payment.model.PaymentState;
import com.salvage.core.payment.model.ProviderOperation;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.repository.Repository;

/**
 * Tenant-scoped access to the record of every provider call.
 *
 * <p>Bare {@link Repository}, not {@code JpaRepository}: this table records
 * money movement, and an unscoped {@code findAll()} or {@code deleteAll()}
 * across tenants is not a query this application should be able to express.
 */
public interface ProviderOperationRepository extends Repository<ProviderOperation, UUID> {

    ProviderOperation save(ProviderOperation operation);

    Optional<ProviderOperation> findByMerchantIdAndIdempotencyKey(
            String merchantId, String idempotencyKey);

    List<ProviderOperation> findByMerchantIdAndPaymentAttemptIdOrderByStartedAtDesc(
            String merchantId, String paymentAttemptId);

    /**
     * Calls that were started and whose outcome this system never learned.
     *
     * <p>The reconciliation sweep's work queue. Ordered oldest first because
     * an unresolved money movement gets worse with age, not better.
     */
    List<ProviderOperation> findByMerchantIdAndOutcomeStateAndStartedAtLessThanOrderByStartedAtAsc(
            String merchantId, PaymentState outcomeState, Instant olderThan, Limit limit);

    long countByMerchantIdAndOutcomeState(String merchantId, PaymentState outcomeState);
}
