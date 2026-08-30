package com.salvage.core.saga.repository;

import com.salvage.core.saga.model.RecoverySagaRecord;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.repository.Repository;

/**
 * Tenant-scoped access to recovery sagas.
 *
 * <p>Bare {@link Repository}, not {@code JpaRepository}. See
 * {@link com.salvage.core.ledger.repository.LedgerEntryRepository}. A saga is
 * an in-flight money movement; {@code findAll()} across every tenant's
 * in-flight movements is not a query this application should be able to
 * express, and {@code deleteById()} on one is worse.
 */
public interface RecoverySagaRepository extends Repository<RecoverySagaRecord, UUID> {

    RecoverySagaRecord save(RecoverySagaRecord saga);

    /**
     * Lookup by the row's surrogate primary key, scoped by tenant.
     *
     * <p>Distinct from {@link #findByMerchantIdAndSagaId}: the entity carries
     * both a generated {@code id} and a separate business {@code saga_id}, and
     * {@code recovery_decisions.saga_id} is a foreign key onto the former. So
     * a decision's {@code getSagaId()} must be resolved through this method,
     * not through the similarly-named one below. The two are easy to confuse
     * and the confusion is silent -- the query simply finds nothing.
     */
    Optional<RecoverySagaRecord> findByMerchantIdAndId(String merchantId, UUID id);

    Optional<RecoverySagaRecord> findByMerchantIdAndSagaId(String merchantId, UUID sagaId);

    Optional<RecoverySagaRecord> findByMerchantIdAndPaymentAttemptId(
            String merchantId, String paymentAttemptId);
}
