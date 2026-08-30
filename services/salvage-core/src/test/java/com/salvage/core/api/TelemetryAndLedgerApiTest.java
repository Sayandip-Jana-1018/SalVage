package com.salvage.core.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.salvage.core.ingest.SalvageInfrastructure;
import com.salvage.core.model.Merchant;
import com.salvage.core.ledger.service.LedgerService;
import com.salvage.core.policy.model.RecoveryActionType;
import com.salvage.core.policy.model.RecoveryDecisionRecord;
import com.salvage.core.policy.repository.RecoveryDecisionRepository;
import com.salvage.core.repository.MerchantRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The read API serves what is in the database, and nothing when there is nothing.
 *
 * <p>The last part is the point of this class. The MCP client these routes
 * replace caught its own connection failure and returned invented figures --
 * a recovery rate, a rupee total, a taxonomy breakdown -- which were
 * indistinguishable from measurements to everything downstream, including a
 * language model that repeated them to operators. The first test below pins
 * the opposite behaviour: an unknown merchant gets zeros, not plausible
 * numbers.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TelemetryAndLedgerApiTest extends SalvageInfrastructure {

    @LocalServerPort private int port;

    @Autowired private TestRestTemplate rest;
    @Autowired private LedgerService ledgerService;
    @Autowired private RecoveryDecisionRepository decisions;
    @Autowired private MerchantRepository merchants;
    @Autowired private TransactionTemplate transactionTemplate;

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    /**
     * Register a tenant and return its id.
     *
     * <p>Every table carrying a {@code merchant_id} has a foreign key to
     * {@code merchants}, so writing ledger or decision rows for an
     * unregistered tenant is refused by the database. That is the intended
     * behaviour -- salvage-core fails closed on an unknown merchant rather
     * than auto-provisioning one -- so the tests register explicitly.
     */
    private String registerMerchant(String prefix) {
        String merchantId = prefix + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        transactionTemplate.executeWithoutResult(
                status -> merchants.save(new Merchant(merchantId, "Api Test " + merchantId)));
        return merchantId;
    }

    @Test
    void a_merchant_with_no_activity_reports_zeros_rather_than_plausible_numbers() {
        // Deliberately NOT registered: an unknown merchant must read as zeros.
        String merchant = "merchant_unknown_" + UUID.randomUUID();

        MerchantStats stats =
                rest.getForObject(url("/api/v1/telemetry/merchants/" + merchant + "/stats"), MerchantStats.class);

        assertThat(stats).isNotNull();
        assertThat(stats.failuresObserved()).isZero();
        assertThat(stats.decisionsMade()).isZero();
        assertThat(stats.decisionsPermitted()).isZero();
        assertThat(stats.decisionsRefusedByBounds()).isZero();
        assertThat(stats.expectedNetValuePaisePermitted()).isZero();
        assertThat(stats.taxonomyBreakdown()).isEmpty();
        assertThat(stats.actionBreakdown()).isEmpty();
        assertThat(stats.truncated()).isFalse();
    }

    @Test
    void refused_decisions_are_counted_but_do_not_contribute_expected_value() {
        String merchant = registerMerchant("m_bounds_");
        // The schema constrains this column to PERMITTED / REJECTED / BYPASSED.
        writeDecision(merchant, RecoveryActionType.SWITCH_RAIL, "PERMITTED", 50_000L);
        writeDecision(merchant, RecoveryActionType.RETRY_SCHEDULED, "REJECTED", 90_000L);

        MerchantStats stats =
                rest.getForObject(url("/api/v1/telemetry/merchants/" + merchant + "/stats"), MerchantStats.class);

        assertThat(stats).isNotNull();
        assertThat(stats.decisionsMade()).isEqualTo(2);
        assertThat(stats.decisionsPermitted()).isEqualTo(1);
        assertThat(stats.decisionsRefusedByBounds()).isEqualTo(1);
        // Only the permitted decision contributes. Counting the refused one
        // would credit the policy with value from the actions the bounds
        // engine stopped, which is the opposite of what a bound is for.
        assertThat(stats.expectedNetValuePaisePermitted()).isEqualTo(50_000L);
        assertThat(stats.actionBreakdown())
                .containsEntry("SWITCH_RAIL", 1L)
                .containsEntry("RETRY_SCHEDULED", 1L);
    }

    @Test
    void a_bypassed_decision_counts_as_permitted_not_refused() {
        // BYPASSED means the bounds checks were skipped, not that they failed.
        // The action went ahead, so classing it as a refusal would understate
        // what the system did and drop its value from the total.
        String merchant = registerMerchant("m_bypass_");
        writeDecision(merchant, RecoveryActionType.RETRY_IMMEDIATE, "BYPASSED", 7_000L);

        MerchantStats stats =
                rest.getForObject(url("/api/v1/telemetry/merchants/" + merchant + "/stats"), MerchantStats.class);

        assertThat(stats).isNotNull();
        assertThat(stats.decisionsRefusedByBounds()).isZero();
        assertThat(stats.decisionsPermitted()).isEqualTo(1);
        assertThat(stats.expectedNetValuePaisePermitted()).isEqualTo(7_000L);
    }

    @Test
    void an_out_of_range_window_is_rejected_rather_than_clamped() {
        // Clamping would answer a question the caller did not ask and label the
        // result with the window they did ask for.
        var response =
                rest.getForEntity(
                        url("/api/v1/telemetry/merchants/anyone/stats?hours=100000"), String.class);
        assertThat(response.getStatusCode().value()).isEqualTo(400);
    }

    @Test
    void an_empty_chain_verifies_as_valid_and_reports_the_genesis_head() {
        String merchant = registerMerchant("m_empty_");

        var verification =
                rest.getForObject(
                        url("/api/v1/ledger/merchants/" + merchant + "/verify"),
                        LedgerController.ChainVerification.class);

        assertThat(verification).isNotNull();
        assertThat(verification.valid()).isTrue();
        assertThat(verification.verifiedEntries()).isZero();
        assertThat(verification.failureIndex()).isNull();
    }

    @Test
    void a_written_chain_verifies_and_the_entries_are_served_newest_first() {
        String merchant = registerMerchant("m_chain_");
        transactionTemplate.executeWithoutResult(
                status -> {
                    ledgerService.append(merchant, "TEST", "e1", "FIRST", "{\"n\":1}");
                    ledgerService.append(merchant, "TEST", "e2", "SECOND", "{\"n\":2}");
                    ledgerService.append(merchant, "TEST", "e3", "THIRD", "{\"n\":3}");
                });

        var verification =
                rest.getForObject(
                        url("/api/v1/ledger/merchants/" + merchant + "/verify"),
                        LedgerController.ChainVerification.class);
        assertThat(verification).isNotNull();
        assertThat(verification.valid()).isTrue();
        assertThat(verification.verifiedEntries()).isEqualTo(3);
        assertThat(verification.headHash()).hasSize(64);

        LedgerController.LedgerEntryView[] entries =
                rest.getForObject(
                        url("/api/v1/ledger/merchants/" + merchant + "/entries?limit=2"),
                        LedgerController.LedgerEntryView[].class);
        assertThat(entries).isNotNull().hasSize(2);
        assertThat(entries[0].entryIndex()).isEqualTo(3);
        assertThat(entries[1].entryIndex()).isEqualTo(2);
        // Hashes are served whole. Truncating them for display server-side
        // would defeat the only reason to expose the chain: letting someone
        // else recompute it.
        assertThat(entries[0].entryHash()).hasSize(64);
        assertThat(entries[0].prevHash()).isEqualTo(entries[1].entryHash());
    }

    @Test
    void one_merchants_ledger_is_not_visible_through_another_merchants_route() {
        String owner = registerMerchant("m_owner_");
        String stranger = registerMerchant("m_stranger_");
        transactionTemplate.executeWithoutResult(
                status -> ledgerService.append(owner, "TEST", "e1", "SECRET", "{\"n\":1}"));

        LedgerController.LedgerEntryView[] entries =
                rest.getForObject(
                        url("/api/v1/ledger/merchants/" + stranger + "/entries"),
                        LedgerController.LedgerEntryView[].class);

        assertThat(entries).isNotNull().isEmpty();
    }

    private void writeDecision(
            String merchantId, RecoveryActionType action, String boundsStatus, long expectedNet) {
        transactionTemplate.executeWithoutResult(
                status ->
                        decisions.save(
                                new RecoveryDecisionRecord(
                                        UUID.randomUUID(),
                                        merchantId,
                                        "pay_" + UUID.randomUUID(),
                                        action,
                                        new BigDecimal("0.5000"),
                                        expectedNet,
                                        null,
                                        null,
                                        null,
                                        boundsStatus,
                                        null,
                                        null,
                                        "{}",
                                        Instant.now())));
    }
}
