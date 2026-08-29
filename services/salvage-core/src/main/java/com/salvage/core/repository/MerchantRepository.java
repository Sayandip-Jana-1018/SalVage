package com.salvage.core.repository;

import java.util.Optional;

import org.springframework.data.repository.Repository;

import com.salvage.core.model.Merchant;

/**
 * Access to the multi-tenant root.
 *
 * <p>This is the one repository where the tenant identifier <em>is</em> the
 * primary key, so a lookup by id is inherently scoped. It still avoids
 * {@code JpaRepository} so that {@code findAll()} and {@code deleteAll()} are
 * not available to callers by accident.
 */
public interface MerchantRepository extends Repository<Merchant, String> {

    Merchant save(Merchant merchant);

    Optional<Merchant> findByMerchantId(String merchantId);

    boolean existsByMerchantId(String merchantId);
}
