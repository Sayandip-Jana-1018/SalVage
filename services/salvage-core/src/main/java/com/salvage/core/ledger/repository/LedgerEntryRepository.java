package com.salvage.core.ledger.repository;

import com.salvage.core.ledger.model.LedgerEntry;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, UUID> {

    Optional<LedgerEntry> findTopByMerchantIdOrderByEntryIndexDesc(String merchantId);

    List<LedgerEntry> findAllByMerchantIdOrderByEntryIndexAsc(String merchantId);

    long countByMerchantId(String merchantId);
}
