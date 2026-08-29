package com.salvage.core.chaos;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.salvage.core.ingest.SalvageInfrastructure;
import com.salvage.core.ledger.service.LedgerService;
import com.salvage.core.model.Merchant;
import com.salvage.core.outbox.model.OutboxRecord;
import com.salvage.core.outbox.model.OutboxStatus;
import com.salvage.core.outbox.publisher.OutboxPublisher;
import com.salvage.core.outbox.repository.OutboxRepository;
import com.salvage.core.outbox.service.OutboxService;
import com.salvage.core.repository.MerchantRepository;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class TransactionalOutboxChaosTest extends SalvageInfrastructure {

    @Autowired
    private OutboxService outboxService;

    @Autowired
    private OutboxPublisher outboxPublisher;

    @Autowired
    private OutboxRepository outboxRepository;

    @Autowired
    private LedgerService ledgerService;

    @Autowired
    private MerchantRepository merchantRepository;

    @Autowired
    private TransactionTemplate transactionTemplate;

    private String merchantId;

    @BeforeEach
    void setUp() {
        merchantId = "m_outbox_" + UUID.randomUUID().toString().substring(0, 8);
        merchantRepository.save(new Merchant(merchantId, "Outbox Chaos Merchant"));
    }

    @Test
    void outbox_events_are_committed_atomically_with_business_state_and_relayed_to_kafka() {
        String aggregateId = "att_" + UUID.randomUUID();

        // Atomic transaction writing ledger + outbox event
        transactionTemplate.execute(status -> {
            ledgerService.append(merchantId, "ATTEMPT", aggregateId, "PAYMENT_RETRY_INITIATED", "{\"attempt\": 1}");
            outboxService.stageEvent(
                    merchantId,
                    "PAYMENT_ATTEMPT",
                    aggregateId,
                    "salvage.recovery.retry",
                    "salvage.events.recovery",
                    Map.of("merchant_id", merchantId, "attempt_id", aggregateId));
            return null;
        });

        // Verify outbox record is staged as PENDING
        List<OutboxRecord> pending = outboxRepository.findPendingEventsForPublishing(10);
        assertThat(pending).anyMatch(r -> r.getAggregateId().equals(aggregateId) && r.getStatus() == OutboxStatus.PENDING);

        // Run outbox publisher
        int published = outboxPublisher.publishPendingEvents();
        assertThat(published).isGreaterThanOrEqualTo(1);

        // Verify record is now marked PUBLISHED
        List<OutboxRecord> all = outboxRepository.findAll();
        assertThat(all).anyMatch(r -> r.getAggregateId().equals(aggregateId) &&
                                         r.getStatus() == OutboxStatus.PUBLISHED &&
                                         r.getPublishedAt() != null);
    }

    @Test
    void failed_transaction_rolls_back_outbox_staging_leaving_zero_orphaned_events() {
        String aggregateId = "att_failed_" + UUID.randomUUID();

        assertThatThrownBy(() -> {
            transactionTemplate.execute(status -> {
                ledgerService.append(merchantId, "ATTEMPT", aggregateId, "FAILING_TX", "{\"val\": 1}");
                outboxService.stageEvent(
                        merchantId,
                        "PAYMENT_ATTEMPT",
                        aggregateId,
                        "salvage.failing.event",
                        "salvage.events.recovery",
                        Map.of("val", 1));

                // Force exception mid-transaction
                throw new RuntimeException("Simulated mid-transaction database crash");
            });
        }).isInstanceOf(RuntimeException.class);

        // Assert outbox table has ZERO rows for this aggregate
        List<OutboxRecord> all = outboxRepository.findAll();
        assertThat(all).noneMatch(r -> r.getAggregateId().equals(aggregateId));
    }
}
