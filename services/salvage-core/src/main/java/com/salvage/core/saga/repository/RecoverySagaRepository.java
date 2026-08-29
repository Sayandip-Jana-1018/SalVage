package com.salvage.core.saga.repository;

import com.salvage.core.saga.model.RecoverySagaRecord;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface RecoverySagaRepository extends JpaRepository<RecoverySagaRecord, UUID> {

    Optional<RecoverySagaRecord> findByMerchantIdAndSagaId(String merchantId, UUID sagaId);

    Optional<RecoverySagaRecord> findByMerchantIdAndPaymentAttemptId(String merchantId, String paymentAttemptId);
}
