package com.salvage.core.ledger.service;

import com.salvage.core.ledger.model.LedgerEntry;
import com.salvage.core.ledger.repository.LedgerEntryRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service managing append-only cryptographic ledger entries with SHA-256 hash chaining.
 */
@Service
public class LedgerService {

    private final LedgerEntryRepository ledgerRepository;

    public LedgerService(LedgerEntryRepository ledgerRepository) {
        this.ledgerRepository = Objects.requireNonNull(ledgerRepository, "ledgerRepository must not be null");
    }

    /**
     * Computes the SHA-256 digest of a ledger entry given its fields.
     */
    public static String computeHash(
            String prevHash,
            Long entryIndex,
            String merchantId,
            String entityType,
            String entityId,
            String eventType,
            String payload,
            Instant createdAt) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String canonicalInput = String.format(
                    "%s|%d|%s|%s|%s|%s|%s|%s",
                    prevHash,
                    entryIndex,
                    merchantId,
                    entityType,
                    entityId,
                    eventType,
                    payload,
                    DateTimeFormatter.ISO_INSTANT.format(createdAt));
            byte[] hashBytes = digest.digest(canonicalInput.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashBytes);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm not available in JVM", e);
        }
    }

    /**
     * Appends a new verified entry to the tenant's hash chain.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public LedgerEntry append(
            String merchantId,
            String entityType,
            String entityId,
            String eventType,
            String payload) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        Objects.requireNonNull(entityType, "entityType must not be null");
        Objects.requireNonNull(entityId, "entityId must not be null");
        Objects.requireNonNull(eventType, "eventType must not be null");
        Objects.requireNonNull(payload, "payload must not be null");

        Optional<LedgerEntry> latestOpt = ledgerRepository.findTopByMerchantIdOrderByEntryIndexDesc(merchantId);

        long nextIndex = latestOpt.isPresent() ? latestOpt.get().getEntryIndex() + 1L : 1L;
        String prevHash = latestOpt.isPresent() ? latestOpt.get().getEntryHash() : LedgerEntry.GENESIS_HASH;
        Instant now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);

        String entryHash = computeHash(
                prevHash,
                nextIndex,
                merchantId,
                entityType,
                entityId,
                eventType,
                payload,
                now);

        LedgerEntry newEntry = new LedgerEntry(
                nextIndex,
                merchantId,
                entityType,
                entityId,
                eventType,
                payload,
                prevHash,
                entryHash,
                now);

        return ledgerRepository.save(newEntry);
    }
}
