package com.salvage.core.bounds.repository;

import com.salvage.core.bounds.model.ContactBudget;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ContactBudgetRepository extends JpaRepository<ContactBudget, UUID> {

    @Query("SELECT cb FROM ContactBudget cb WHERE cb.merchantId = :merchantId " +
           "AND cb.customerId = :customerId " +
           "AND :now >= cb.windowStart AND :now < cb.windowEnd")
    Optional<ContactBudget> findActiveBudget(
            @Param("merchantId") String merchantId,
            @Param("customerId") String customerId,
            @Param("now") Instant now);
}
