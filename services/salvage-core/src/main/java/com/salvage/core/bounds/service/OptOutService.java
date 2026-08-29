package com.salvage.core.bounds.service;

import com.salvage.core.bounds.model.Channel;
import com.salvage.core.bounds.model.OptOut;
import com.salvage.core.bounds.repository.OptOutRepository;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OptOutService {

    private final OptOutRepository optOutRepository;

    public OptOutService(OptOutRepository optOutRepository) {
        this.optOutRepository = Objects.requireNonNull(optOutRepository, "optOutRepository must not be null");
    }

    /**
     * Checks if a customer has opted out on the specified channel or ALL channels.
     */
    @Transactional(readOnly = true)
    public boolean isOptedOut(String merchantId, String customerId, Channel channel) {
        if (customerId == null || customerId.isBlank()) {
            return false;
        }
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(channel, "channel must not be null");

        List<OptOut> optOuts = optOutRepository.findAllByMerchantIdAndCustomerId(merchantId, customerId);
        return optOuts.stream().anyMatch(o -> o.getChannel() == Channel.ALL || o.getChannel() == channel);
    }

    /**
     * Registers a new customer opt-out.
     */
    @Transactional
    public OptOut registerOptOut(String merchantId, String customerId, Channel channel, String reason) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(customerId, "customerId must not be null");
        Objects.requireNonNull(channel, "channel must not be null");

        return optOutRepository.findByMerchantIdAndCustomerIdAndChannel(merchantId, customerId, channel)
                .orElseGet(() -> optOutRepository.save(new OptOut(merchantId, customerId, channel, reason, Instant.now())));
    }
}
