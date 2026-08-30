package com.salvage.core.api;

import com.salvage.core.model.FailureEvent;
import com.salvage.core.policy.model.RecoveryActionType;
import com.salvage.core.policy.model.RecoveryDecisionRecord;
import com.salvage.core.policy.repository.RecoveryDecisionRepository;
import com.salvage.core.repository.FailureEventRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Aggregates what actually happened, for the operator console and the MCP server.
 *
 * <p>Every number this returns is counted from rows in the database. There is
 * no fallback, no default, and no illustrative value: if a merchant has done
 * nothing, the counts are zero and the rates are zero, and that is the honest
 * answer. An earlier version of the MCP client filled this gap on its own by
 * catching the connection error and returning invented figures -- a 52.9%
 * recovery rate, 181,000 rupees recovered, a plausible taxonomy breakdown.
 * Nothing distinguished those from measurements, and they were being handed to
 * a language model that would repeat them to an operator as fact.
 *
 * <p>The window is bounded and the reads are capped. An audit trail grows
 * without limit and this endpoint is called on every console page load.
 */
@Service
public class TelemetryService {

    /**
     * Ceiling on rows pulled into memory for one aggregation.
     *
     * <p>Chosen so that the response stays bounded rather than to match any
     * expected volume. When a window contains more failures than this, the
     * response says so via {@code truncated}, because silently aggregating a
     * prefix and presenting it as the window's totals would be a lie of
     * exactly the kind this class exists to remove.
     */
    static final int MAX_ROWS = 10_000;

    private final FailureEventRepository failureEvents;
    private final RecoveryDecisionRepository decisions;

    public TelemetryService(
            FailureEventRepository failureEvents, RecoveryDecisionRepository decisions) {
        this.failureEvents = Objects.requireNonNull(failureEvents, "failureEvents must not be null");
        this.decisions = Objects.requireNonNull(decisions, "decisions must not be null");
    }

    @Transactional(readOnly = true)
    public MerchantStats statsFor(String merchantId, int windowHours) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        if (windowHours < 1 || windowHours > 24 * 90) {
            throw new IllegalArgumentException(
                    "windowHours must be between 1 and 2160, got " + windowHours);
        }

        Instant since = Instant.now().minus(Duration.ofHours(windowHours));
        Limit cap = Limit.of(MAX_ROWS);

        long totalFailures = failureEvents.countByMerchantIdAndEventTimestampGreaterThanEqual(merchantId, since);
        List<FailureEvent> failureRows =
                failureEvents.findByMerchantIdAndEventTimestampGreaterThanEqualOrderByEventTimestampDesc(
                        merchantId, since, cap);

        long totalDecisions = decisions.countByMerchantIdAndCreatedAtGreaterThanEqual(merchantId, since);
        List<RecoveryDecisionRecord> decisionRows =
                decisions.findByMerchantIdAndCreatedAtGreaterThanEqualOrderByCreatedAtDesc(
                        merchantId, since, cap);

        Map<String, Long> taxonomy = new TreeMap<>();
        for (FailureEvent event : failureRows) {
            // An unclassified failure is reported as unclassified rather than
            // dropped. The share of traffic the taxonomy cannot name is itself
            // a number the operator needs; hiding it would make the mapper's
            // coverage look better than it is.
            String code = event.getTaxonomyCode() == null ? "UNCLASSIFIED" : event.getTaxonomyCode();
            taxonomy.merge(code, 1L, Long::sum);
        }

        Map<RecoveryActionType, Long> actions = new EnumMap<>(RecoveryActionType.class);
        long permitted = 0;
        long refused = 0;
        long expectedNetPaise = 0;
        for (RecoveryDecisionRecord decision : decisionRows) {
            actions.merge(decision.getChosenAction(), 1L, Long::sum);
            if (BoundsStatus.isRefusal(decision.getBoundsEvaluationStatus())) {
                refused++;
            } else {
                permitted++;
                // Only permitted decisions contribute. A refused decision moved
                // no money, so counting its expected value would inflate the
                // total by exactly the actions the bounds engine stopped.
                expectedNetPaise += decision.getExpectedNetValuePaise();
            }
        }

        Map<String, Long> actionBreakdown = new TreeMap<>();
        actions.forEach((action, count) -> actionBreakdown.put(action.name(), count));

        return new MerchantStats(
                merchantId,
                windowHours,
                since,
                totalFailures,
                totalDecisions,
                permitted,
                refused,
                expectedNetPaise,
                taxonomy,
                actionBreakdown,
                totalFailures > failureRows.size() || totalDecisions > decisionRows.size());
    }

    /**
     * The bounds engine's verdict, as recorded on a decision.
     *
     * <p>The schema constrains this column to exactly three values, so the
     * domain is closed and enumerating it here is safe. The distinction that
     * matters is narrower than "not permitted": only {@code REJECTED} means
     * the bounds engine stopped the action. {@code BYPASSED} means the checks
     * were skipped, not that they failed -- the action still went ahead, so
     * counting it as a refusal would understate what the system did and
     * silently drop its expected value from the total.
     *
     * <p>{@code BYPASSED} is currently written by nothing;
     * {@code RecoveryPolicyExecutor} emits only {@code PERMITTED} and
     * {@code REJECTED}. It is handled anyway because the schema permits it,
     * and a value the database can hold but the reader does not understand is
     * how a counting bug gets in.
     */
    static final class BoundsStatus {
        static final String PERMITTED = "PERMITTED";
        static final String REJECTED = "REJECTED";
        static final String BYPASSED = "BYPASSED";

        private BoundsStatus() {}

        /** True only for a decision the bounds engine actually stopped. */
        static boolean isRefusal(String status) {
            return REJECTED.equalsIgnoreCase(status);
        }
    }
}
