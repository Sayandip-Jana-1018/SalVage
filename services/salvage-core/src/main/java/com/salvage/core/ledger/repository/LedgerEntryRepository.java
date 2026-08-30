package com.salvage.core.ledger.repository;

import com.salvage.core.ledger.model.LedgerEntry;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.repository.Repository;

/**
 * Tenant-scoped access to the append-only ledger.
 *
 * <p>This extends Spring Data's bare {@link Repository} marker rather than
 * {@code JpaRepository}, for the same reason
 * {@code com.salvage.core.repository.PaymentAttemptRepository} does, only more
 * urgently. {@code JpaRepository} would inherit {@code findAll()},
 * {@code deleteAll()}, {@code delete()} and {@code deleteById()} -- none of
 * which take a merchant id, and three of which mutate.
 *
 * <p>An earlier version of this interface did extend {@code JpaRepository}.
 * That gave every caller a one-line route to deleting another tenant's audit
 * trail from an append-only ledger whose entire purpose is that it cannot be
 * altered. The database triggers would have refused the delete, so nothing
 * would actually have been lost -- but a tamper-evidence guarantee that rests
 * on a database trigger catching application code doing the wrong thing is
 * one layer of defence, not two.
 *
 * <p>Every method here takes {@code merchantId} first. Nothing here mutates:
 * appends go through {@link com.salvage.core.ledger.service.LedgerService},
 * which is the only writer.
 */
public interface LedgerEntryRepository extends Repository<LedgerEntry, UUID> {

    LedgerEntry save(LedgerEntry entry);

    /** The chain head, used to source {@code prev_hash} for the next append. */
    Optional<LedgerEntry> findTopByMerchantIdOrderByEntryIndexDesc(String merchantId);

    /** The whole chain in order. Verification needs every entry, by definition. */
    List<LedgerEntry> findAllByMerchantIdOrderByEntryIndexAsc(String merchantId);

    /**
     * The most recent entries, newest first.
     *
     * <p>Takes a {@link Limit} rather than returning everything and slicing in
     * Java: an audit trail grows without bound, and the operator console asks
     * for the last twenty of them on every page load.
     */
    List<LedgerEntry> findByMerchantIdOrderByEntryIndexDesc(String merchantId, Limit limit);

    long countByMerchantId(String merchantId);
}
