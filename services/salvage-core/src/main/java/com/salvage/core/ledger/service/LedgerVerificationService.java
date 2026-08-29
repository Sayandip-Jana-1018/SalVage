package com.salvage.core.ledger.service;

import com.salvage.core.ledger.model.LedgerEntry;
import com.salvage.core.ledger.repository.LedgerEntryRepository;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service to cryptographically audit and verify ledger hash chain continuity and tamper-evidence.
 */
@Service
public class LedgerVerificationService {

    private final LedgerEntryRepository ledgerRepository;

    public LedgerVerificationService(LedgerEntryRepository ledgerRepository) {
        this.ledgerRepository = Objects.requireNonNull(ledgerRepository, "ledgerRepository must not be null");
    }

    /**
     * Loads the entire hash chain for a merchant in sequence and verifies cryptographic integrity.
     */
    @Transactional(readOnly = true)
    public VerificationResult verifyChain(String merchantId) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        List<LedgerEntry> entries = ledgerRepository.findAllByMerchantIdOrderByEntryIndexAsc(merchantId);
        return verifyEntries(entries);
    }

    /**
     * Walks an ordered list of ledger entries in sequence and verifies:
     * 1. 1-indexed sequential entry numbers without gaps.
     * 2. First entry points to the GENESIS hash.
     * 3. Each subsequent entry points to the entry_hash of the immediately preceding record.
     * 4. Each entry's entry_hash matches the SHA-256 hash computed from its content and prev_hash.
     */
    public VerificationResult verifyEntries(List<LedgerEntry> entries) {
        if (entries == null || entries.isEmpty()) {
            return VerificationResult.valid(0, LedgerEntry.GENESIS_HASH);
        }

        String expectedPrevHash = LedgerEntry.GENESIS_HASH;
        long expectedIndex = 1L;

        for (LedgerEntry entry : entries) {
            if (!entry.getEntryIndex().equals(expectedIndex)) {
                return VerificationResult.tampered(
                        entry.getEntryIndex(),
                        String.format("Expected entry_index %d but found %d (gap or sequence violation)",
                                expectedIndex, entry.getEntryIndex()));
            }

            if (!entry.getPrevHash().equals(expectedPrevHash)) {
                return VerificationResult.tampered(
                        entry.getEntryIndex(),
                        String.format("Invalid prev_hash at entry %d. Expected: %s, Found: %s",
                                entry.getEntryIndex(), expectedPrevHash, entry.getPrevHash()));
            }

            String recomputedHash = LedgerService.computeHash(
                    entry.getPrevHash(),
                    entry.getEntryIndex(),
                    entry.getMerchantId(),
                    entry.getEntityType(),
                    entry.getEntityId(),
                    entry.getEventType(),
                    entry.getPayload(),
                    entry.getCreatedAt());

            if (!entry.getEntryHash().equals(recomputedHash)) {
                return VerificationResult.tampered(
                        entry.getEntryIndex(),
                        String.format("Tampered entry_hash at entry %d. Expected recomputed: %s, Recorded: %s",
                                entry.getEntryIndex(), recomputedHash, entry.getEntryHash()));
            }

            expectedPrevHash = entry.getEntryHash();
            expectedIndex++;
        }

        return VerificationResult.valid(entries.size(), expectedPrevHash);
    }
}
