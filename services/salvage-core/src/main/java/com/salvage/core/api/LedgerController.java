package com.salvage.core.api;

import com.salvage.core.ledger.model.LedgerEntry;
import com.salvage.core.ledger.repository.LedgerEntryRepository;
import com.salvage.core.ledger.service.LedgerVerificationService;
import com.salvage.core.ledger.service.VerificationResult;
import com.salvage.core.api.auth.ApiPrincipal;
import java.util.List;
import java.util.Objects;
import org.springframework.data.domain.Limit;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read access to the tamper-evident ledger.
 *
 * <p>This is the endpoint that makes the integrity claim checkable rather than
 * asserted. {@code /verify} rewalks the whole chain, recomputing every hash
 * from the stored content, and reports the first entry that does not match. A
 * caller does not have to trust that the chain is intact; they can ask.
 *
 * <p>Every route is scoped by {@code merchantId} in the path and every query
 * beneath it is tenant-scoped in the repository. There is no route that reads
 * across tenants.
 *
 * <p><strong>Authentication.</strong> Every route below takes an
 * {@link com.salvage.core.api.auth.ApiPrincipal} and calls
 * {@code requireTenant}, so a key bound to one merchant reading another gets a
 * 404 -- not a 403, which would confirm the other tenant exists. Until Phase 13
 * these routes were readable by anyone who could reach the port. Ledger
 * payloads carry decision context rather than card data, but they are a
 * tenant's business records and serving them anonymously was indefensible.
 */
@RestController
@RequestMapping("/api/v1/ledger")
public class LedgerController {

    /** Cap on entries returned in one page, to bound the response. */
    private static final int MAX_LIMIT = 200;
    private static final int DEFAULT_LIMIT = 20;

    private final LedgerEntryRepository ledgerEntries;
    private final LedgerVerificationService verification;

    public LedgerController(
            LedgerEntryRepository ledgerEntries, LedgerVerificationService verification) {
        this.ledgerEntries = Objects.requireNonNull(ledgerEntries, "ledgerEntries must not be null");
        this.verification = Objects.requireNonNull(verification, "verification must not be null");
    }

    @GetMapping("/merchants/{merchantId}/entries")
    @Transactional(readOnly = true)
    public List<LedgerEntryView> entries(
            @PathVariable String merchantId,
            ApiPrincipal principal,
            @RequestParam(defaultValue = "" + DEFAULT_LIMIT) int limit) {
        principal.requireTenant(merchantId);
        int effective = Math.clamp(limit, 1, MAX_LIMIT);
        return ledgerEntries
                .findByMerchantIdOrderByEntryIndexDesc(merchantId, Limit.of(effective))
                .stream()
                .map(LedgerEntryView::from)
                .toList();
    }

    /**
     * Rewalk and verify the merchant's whole chain.
     *
     * <p>Returns 200 with {@code valid: false} rather than an error status when
     * the chain is broken. A tampered ledger is a successfully answered
     * question, not a failed request, and a 4xx/5xx here would be retried by
     * clients and swallowed by proxies -- exactly the wrong handling for the
     * one signal that most needs to reach a human.
     */
    @GetMapping("/merchants/{merchantId}/verify")
    public ResponseEntity<ChainVerification> verify(
            @PathVariable String merchantId, ApiPrincipal principal) {
        principal.requireTenant(merchantId);
        VerificationResult result = verification.verifyChain(merchantId);
        return ResponseEntity.ok(ChainVerification.from(merchantId, result));
    }

    @GetMapping("/merchants/{merchantId}/count")
    @Transactional(readOnly = true)
    public long count(@PathVariable String merchantId, ApiPrincipal principal) {
        principal.requireTenant(merchantId);
        return ledgerEntries.countByMerchantId(merchantId);
    }

    /**
     * A ledger entry as served.
     *
     * <p>Hashes are served in full, not truncated for display. Truncating them
     * server-side would make the response useless for the one thing it is for:
     * an independent party recomputing the chain themselves.
     */
    public record LedgerEntryView(
            @com.fasterxml.jackson.annotation.JsonProperty("entry_index") long entryIndex,
            @com.fasterxml.jackson.annotation.JsonProperty("merchant_id") String merchantId,
            @com.fasterxml.jackson.annotation.JsonProperty("entity_type") String entityType,
            @com.fasterxml.jackson.annotation.JsonProperty("entity_id") String entityId,
            @com.fasterxml.jackson.annotation.JsonProperty("event_type") String eventType,
            @com.fasterxml.jackson.annotation.JsonProperty("payload") String payload,
            @com.fasterxml.jackson.annotation.JsonProperty("prev_hash") String prevHash,
            @com.fasterxml.jackson.annotation.JsonProperty("entry_hash") String entryHash,
            @com.fasterxml.jackson.annotation.JsonProperty("created_at") java.time.Instant createdAt) {

        static LedgerEntryView from(LedgerEntry entry) {
            return new LedgerEntryView(
                    entry.getEntryIndex(),
                    entry.getMerchantId(),
                    entry.getEntityType(),
                    entry.getEntityId(),
                    entry.getEventType(),
                    entry.getPayload(),
                    entry.getPrevHash(),
                    entry.getEntryHash(),
                    entry.getCreatedAt());
        }
    }

    /** The verification verdict, flattened for the wire. */
    public record ChainVerification(
            @com.fasterxml.jackson.annotation.JsonProperty("merchant_id") String merchantId,
            @com.fasterxml.jackson.annotation.JsonProperty("valid") boolean valid,
            @com.fasterxml.jackson.annotation.JsonProperty("verified_entries") long verifiedEntries,
            @com.fasterxml.jackson.annotation.JsonProperty("head_hash") String headHash,
            @com.fasterxml.jackson.annotation.JsonProperty("failure_index") Long failureIndex,
            @com.fasterxml.jackson.annotation.JsonProperty("failure_reason") String failureReason) {

        static ChainVerification from(String merchantId, VerificationResult result) {
            return new ChainVerification(
                    merchantId,
                    result.isValid(),
                    result.verifiedEntriesCount(),
                    result.latestHash().orElse(null),
                    result.failureIndex().orElse(null),
                    result.failureReason().orElse(null));
        }
    }
}
