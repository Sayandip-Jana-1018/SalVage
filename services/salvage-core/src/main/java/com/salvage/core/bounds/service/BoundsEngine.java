package com.salvage.core.bounds.service;

import com.salvage.core.bounds.model.ActionType;
import com.salvage.core.bounds.model.BoundsContext;
import com.salvage.core.bounds.model.BoundsEvaluationResult;
import com.salvage.core.bounds.model.Channel;
import java.time.Instant;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Hard Bounds Engine: The single, non-bypassable code gate that every recovery action must pass through.
 *
 * <p>Enforces:
 * 1. Global / Merchant / Rail Kill Switches
 * 2. Attempt Caps (Max 3 recovery attempts per order)
 * 3. Quiet Hours (22:00 to 08:00 in customer timezone for communications)
 * 4. Customer Opt-Out Registry
 * 5. 24-Hour Customer Contact Quotas
 */
@Component
public class BoundsEngine {

    private static final Logger log = LoggerFactory.getLogger(BoundsEngine.class);
    public static final int MAX_RECOVERY_ATTEMPTS = 3;

    private final KillSwitchService killSwitchService;
    private final QuietHoursGuard quietHoursGuard;
    private final OptOutService optOutService;
    private final ContactBudgetService contactBudgetService;

    public BoundsEngine(
            KillSwitchService killSwitchService,
            QuietHoursGuard quietHoursGuard,
            OptOutService optOutService,
            ContactBudgetService contactBudgetService) {
        this.killSwitchService = Objects.requireNonNull(killSwitchService, "killSwitchService must not be null");
        this.quietHoursGuard = Objects.requireNonNull(quietHoursGuard, "quietHoursGuard must not be null");
        this.optOutService = Objects.requireNonNull(optOutService, "optOutService must not be null");
        this.contactBudgetService = Objects.requireNonNull(contactBudgetService, "contactBudgetService must not be null");
    }

    /**
     * Evaluates whether a proposed recovery action is safe and permitted to execute.
     */
    public BoundsEvaluationResult evaluate(BoundsContext context) {
        Objects.requireNonNull(context, "context must not be null");

        if (context.proposedAction() == ActionType.NO_ACTION) {
            return BoundsEvaluationResult.permit();
        }

        // 1. Kill Switch Check
        if (killSwitchService.isTripped(context.merchantId(), context.railId())) {
            log.info("Action {} rejected by KillSwitchGuard for merchant {} rail {}",
                    context.proposedAction(), context.merchantId(), context.railId());
            return BoundsEvaluationResult.reject(
                    "KillSwitchGuard",
                    "Execution halted by active kill switch");
        }

        // 2. Attempt Cap Guard
        if (context.proposedAction().isMoneyMovement()) {
            if (context.currentAttemptCount() >= MAX_RECOVERY_ATTEMPTS) {
                log.info("Action {} rejected by AttemptCapGuard (attempt count: {} >= max: {})",
                        context.proposedAction(), context.currentAttemptCount(), MAX_RECOVERY_ATTEMPTS);
                return BoundsEvaluationResult.reject(
                        "AttemptCapGuard",
                        String.format("Max attempt cap (%d) reached for payment attempt %s",
                                MAX_RECOVERY_ATTEMPTS, context.paymentAttemptId()));
            }
        }

        // 3. Customer Communication Guards (Quiet Hours, Opt-Out, Contact Budget)
        if (context.proposedAction().isCustomerCommunication()) {
            Instant now = (context.timestamp() != null) ? context.timestamp() : Instant.now();

            // 3a. Quiet Hours
            if (quietHoursGuard.isQuietHour(now, context.customerZone())) {
                log.info("Action {} rejected by QuietHoursGuard for customer {}",
                        context.proposedAction(), context.customerId());
                return BoundsEvaluationResult.reject(
                        "QuietHoursGuard",
                        "Outbound customer communication forbidden during quiet hours (22:00-08:00)");
            }

            // 3b. Opt-Out Registry
            Channel channel = (context.channel() != null) ? context.channel() : Channel.ALL;
            if (optOutService.isOptedOut(context.merchantId(), context.customerId(), channel)) {
                log.info("Action {} rejected by OptOutGuard (customer {} opted out on {})",
                        context.proposedAction(), context.customerId(), channel);
                return BoundsEvaluationResult.reject(
                        "OptOutGuard",
                        String.format("Customer %s has opted out of communication on %s",
                                context.customerId(), channel));
            }

            // 3c. Contact Budget
            if (!contactBudgetService.hasRemainingBudget(context.merchantId(), context.customerId(), now)) {
                log.info("Action {} rejected by ContactBudgetGuard for customer {}",
                        context.proposedAction(), context.customerId());
                return BoundsEvaluationResult.reject(
                        "ContactBudgetGuard",
                        String.format("Customer %s has exhausted their 24-hour contact allowance",
                                context.customerId()));
            }
        }

        return BoundsEvaluationResult.permit();
    }
}
