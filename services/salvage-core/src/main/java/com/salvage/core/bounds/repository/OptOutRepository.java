package com.salvage.core.bounds.repository;

import com.salvage.core.bounds.model.Channel;
import com.salvage.core.bounds.model.OptOut;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface OptOutRepository extends JpaRepository<OptOut, UUID> {

    Optional<OptOut> findByMerchantIdAndCustomerIdAndChannel(String merchantId, String customerId, Channel channel);

    List<OptOut> findAllByMerchantIdAndCustomerId(String merchantId, String customerId);
}
