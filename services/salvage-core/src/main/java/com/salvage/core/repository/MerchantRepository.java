package com.salvage.core.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.salvage.core.model.Merchant;

@Repository
public interface MerchantRepository extends JpaRepository<Merchant, String> {

    /**
     * Every lookup is scoped by merchant_id. This is the pattern: callers
     * pass the merchant they believe they are operating on, and the
     * repository enforces that the returned entity actually belongs to it.
     * Returning Optional rather than throwing ensures the caller handles
     * the absent case explicitly.
     */
    Optional<Merchant> findByMerchantId(String merchantId);
}
