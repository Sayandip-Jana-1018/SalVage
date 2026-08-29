package com.salvage.core.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.repository.Repository;

import com.salvage.core.model.FailureEvent;

/**
 * Tenant-scoped access to failure events. See
 * {@link PaymentAttemptRepository} for why this does not extend
 * {@code JpaRepository}.
 */
public interface FailureEventRepository extends Repository<FailureEvent, UUID> {

    FailureEvent save(FailureEvent failureEvent);

    /**
     * Used by the consumer to detect redelivery. {@code event_id} is unique
     * per tenant in the schema, so this is the read side of that guarantee.
     */
    Optional<FailureEvent> findByMerchantIdAndEventId(String merchantId, UUID eventId);

    List<FailureEvent> findByMerchantIdAndPaymentAttemptId(
            String merchantId, UUID paymentAttemptId);

    long countByMerchantId(String merchantId);
}
