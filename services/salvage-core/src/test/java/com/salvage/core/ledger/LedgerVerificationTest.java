package com.salvage.core.ledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.salvage.core.ingest.SalvageInfrastructure;
import com.salvage.core.ledger.model.LedgerEntry;
import com.salvage.core.ledger.service.LedgerService;
import com.salvage.core.ledger.service.LedgerVerificationService;
import com.salvage.core.ledger.service.VerificationResult;
import com.salvage.core.model.Merchant;
import com.salvage.core.repository.MerchantRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.NONE,
        // This class is about what the code below computes, not about the
        // gate in front of it. Authentication has its own tests in
        // com.salvage.core.api.auth; ApiAuthenticationTest is the one that
        // turns it on and proves a merchant key cannot read another tenant.
        properties = "salvage.auth.required=false")
class LedgerVerificationTest extends SalvageInfrastructure {

    @Autowired
    private LedgerService ledgerService;

    @Autowired
    private LedgerVerificationService verificationService;

    @Autowired
    private MerchantRepository merchantRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private TransactionTemplate transactionTemplate;

    private String merchantId;

    @BeforeEach
    void setUp() {
        merchantId = "m_ledger_test_" + UUID.randomUUID().toString().substring(0, 8);
        merchantRepository.save(new Merchant(merchantId, "Ledger Test Merchant"));
    }

    @Test
    void empty_ledger_is_valid() {
        VerificationResult result = verificationService.verifyChain(merchantId);
        assertThat(result.isValid()).isTrue();
        assertThat(result.verifiedEntriesCount()).isEqualTo(0);
        assertThat(result.latestHash()).contains(LedgerEntry.GENESIS_HASH);
    }

    @Test
    void chain_of_multiple_entries_verifies_successfully() {
        transactionTemplate.execute(status -> {
            for (int i = 1; i <= 10; i++) {
                ledgerService.append(
                        merchantId,
                        "PAYMENT_ATTEMPT",
                        "att_" + i,
                        "ATTEMPT_RECORDED",
                        "{\"attempt\": " + i + ", \"amount\": " + (i * 1000) + "}");
            }
            return null;
        });

        VerificationResult result = verificationService.verifyChain(merchantId);
        assertThat(result.isValid()).isTrue();
        assertThat(result.verifiedEntriesCount()).isEqualTo(10);
        assertThat(result.latestHash()).isPresent();
        assertThat(result.failureIndex()).isEmpty();
    }

    @Test
    void database_triggers_prevent_direct_updates_and_deletions_on_ledger() {
        transactionTemplate.execute(status -> {
            ledgerService.append(merchantId, "ATTEMPT", "1", "EVT_1", "{\"val\": 1}");
            return null;
        });

        // Direct UPDATE must fail at the database level with restrict_violation trigger
        assertThatThrownBy(() ->
                jdbcTemplate.update(
                        "UPDATE salvage.ledger_entries SET payload = '{\"val\": 999}' WHERE merchant_id = ?",
                        merchantId)
        ).isInstanceOf(DataIntegrityViolationException.class)
         .hasMessageContaining("forbidden; this table is append-only");

        // Direct DELETE must also fail at database level
        assertThatThrownBy(() ->
                jdbcTemplate.update(
                        "DELETE FROM salvage.ledger_entries WHERE merchant_id = ?",
                        merchantId)
        ).isInstanceOf(DataIntegrityViolationException.class)
         .hasMessageContaining("forbidden; this table is append-only");
    }

    @Test
    void detects_tampered_payload() {
        List<LedgerEntry> entries = new ArrayList<>();
        String prevHash = LedgerEntry.GENESIS_HASH;
        Instant now = Instant.now();

        for (long i = 1; i <= 3; i++) {
            String payload = "{\"val\": " + i + "}";
            String hash = LedgerService.computeHash(prevHash, i, merchantId, "ATTEMPT", String.valueOf(i), "EVT", payload, now);
            entries.add(new LedgerEntry(i, merchantId, "ATTEMPT", String.valueOf(i), "EVT", payload, prevHash, hash, now));
            prevHash = hash;
        }

        // Tamper with payload of entry 2 without updating hash
        LedgerEntry original2 = entries.get(1);
        LedgerEntry tampered2 = new LedgerEntry(
                original2.getEntryIndex(),
                original2.getMerchantId(),
                original2.getEntityType(),
                original2.getEntityId(),
                original2.getEventType(),
                "{\"val\": 999}", // modified payload
                original2.getPrevHash(),
                original2.getEntryHash(),
                original2.getCreatedAt());
        entries.set(1, tampered2);

        VerificationResult result = verificationService.verifyEntries(entries);
        assertThat(result.isValid()).isFalse();
        assertThat(result.failureIndex()).contains(2L);
        assertThat(result.failureReason()).get().asString().contains("Tampered entry_hash at entry 2");
    }

    @Test
    void detects_tampered_hash_link() {
        List<LedgerEntry> entries = new ArrayList<>();
        String prevHash = LedgerEntry.GENESIS_HASH;
        Instant now = Instant.now();

        for (long i = 1; i <= 3; i++) {
            String payload = "{\"val\": " + i + "}";
            String hash = LedgerService.computeHash(prevHash, i, merchantId, "ATTEMPT", String.valueOf(i), "EVT", payload, now);
            entries.add(new LedgerEntry(i, merchantId, "ATTEMPT", String.valueOf(i), "EVT", payload, prevHash, hash, now));
            prevHash = hash;
        }

        // Tamper with prev_hash link of entry 2
        LedgerEntry original2 = entries.get(1);
        LedgerEntry tampered2 = new LedgerEntry(
                original2.getEntryIndex(),
                original2.getMerchantId(),
                original2.getEntityType(),
                original2.getEntityId(),
                original2.getEventType(),
                original2.getPayload(),
                "1111111111111111111111111111111111111111111111111111111111111111", // broken link
                original2.getEntryHash(),
                original2.getCreatedAt());
        entries.set(1, tampered2);

        VerificationResult result = verificationService.verifyEntries(entries);
        assertThat(result.isValid()).isFalse();
        assertThat(result.failureIndex()).contains(2L);
        assertThat(result.failureReason()).get().asString().contains("Invalid prev_hash at entry 2");
    }

    @Test
    void detects_deleted_entry_causing_sequence_gap() {
        List<LedgerEntry> entries = new ArrayList<>();
        String prevHash = LedgerEntry.GENESIS_HASH;
        Instant now = Instant.now();

        for (long i = 1; i <= 3; i++) {
            String payload = "{\"val\": " + i + "}";
            String hash = LedgerService.computeHash(prevHash, i, merchantId, "ATTEMPT", String.valueOf(i), "EVT", payload, now);
            entries.add(new LedgerEntry(i, merchantId, "ATTEMPT", String.valueOf(i), "EVT", payload, prevHash, hash, now));
            prevHash = hash;
        }

        // Delete entry 2 from the sequence
        entries.remove(1);

        VerificationResult result = verificationService.verifyEntries(entries);
        assertThat(result.isValid()).isFalse();
        assertThat(result.failureIndex()).contains(3L);
        assertThat(result.failureReason()).get().asString().contains("gap or sequence violation");
    }
}
