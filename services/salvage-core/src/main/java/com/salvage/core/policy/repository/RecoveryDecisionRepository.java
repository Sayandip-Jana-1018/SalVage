package com.salvage.core.policy.repository;

import com.salvage.core.policy.model.RecoveryDecisionRecord;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for immutable recovery decisions.
 */
@Repository
public interface RecoveryDecisionRepository extends JpaRepository<RecoveryDecisionRecord, UUID> {

    List<RecoveryDecisionRecord> findByMerchantIdAndPaymentAttemptIdOrderByCreatedAtDesc(
            String merchantId, String paymentAttemptId);
}
