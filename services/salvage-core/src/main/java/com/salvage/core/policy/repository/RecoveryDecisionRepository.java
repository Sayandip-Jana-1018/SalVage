package com.salvage.core.policy.repository;

import com.salvage.core.policy.model.RecoveryDecisionRecord;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.repository.Repository;

/**
 * Tenant-scoped access to immutable recovery decisions.
 *
 * <p>Bare {@link Repository}, not {@code JpaRepository}. See
 * {@link com.salvage.core.ledger.repository.LedgerEntryRepository} for the
 * reasoning; decisions are the record of what the system chose to do with
 * someone's money, and an unscoped {@code findAll()} across tenants is not a
 * query this application should be able to express.
 */
public interface RecoveryDecisionRepository extends Repository<RecoveryDecisionRecord, UUID> {

    RecoveryDecisionRecord save(RecoveryDecisionRecord decision);

    List<RecoveryDecisionRecord> findByMerchantIdAndPaymentAttemptIdOrderByCreatedAtDesc(
            String merchantId, String paymentAttemptId);

    /**
     * Decisions in a window, newest first. The telemetry endpoint aggregates
     * these; the window is closed at the top so that a slow caller cannot be
     * handed an unbounded result set.
     */
    List<RecoveryDecisionRecord> findByMerchantIdAndCreatedAtGreaterThanEqualOrderByCreatedAtDesc(
            String merchantId, Instant since, Limit limit);

    long countByMerchantIdAndCreatedAtGreaterThanEqual(String merchantId, Instant since);
}
