package com.salvage.core.bounds;

import static org.assertj.core.api.Assertions.assertThat;

import com.salvage.core.bounds.model.ActionType;
import com.salvage.core.bounds.model.BoundsContext;
import com.salvage.core.bounds.model.BoundsEvaluationResult;
import com.salvage.core.bounds.model.Channel;
import com.salvage.core.bounds.model.KillSwitchScope;
import com.salvage.core.bounds.service.BoundsEngine;
import com.salvage.core.bounds.service.ContactBudgetService;
import com.salvage.core.bounds.service.KillSwitchService;
import com.salvage.core.bounds.service.OptOutService;
import com.salvage.core.ingest.SalvageInfrastructure;
import com.salvage.core.model.Merchant;
import com.salvage.core.repository.MerchantRepository;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class BoundsEngineTest extends SalvageInfrastructure {

    @Autowired
    private BoundsEngine boundsEngine;

    @Autowired
    private KillSwitchService killSwitchService;

    @Autowired
    private OptOutService optOutService;

    @Autowired
    private ContactBudgetService contactBudgetService;

    @Autowired
    private MerchantRepository merchantRepository;

    @Autowired
    private TransactionTemplate transactionTemplate;

    private String merchantId;
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    @BeforeEach
    void setUp() {
        merchantId = "m_bounds_" + UUID.randomUUID().toString().substring(0, 8);
        merchantRepository.save(new Merchant(merchantId, "Bounds Test Merchant"));
    }

    @Test
    void attempt_caps_reject_after_max_attempts() {
        String paymentAttemptId = "att_cap_" + UUID.randomUUID();
        String customerId = "cust_cap_1";
        Instant dayTime = ZonedDateTime.of(2026, 8, 30, 14, 0, 0, 0, IST).toInstant();

        // 1st attempt: permitted
        BoundsContext ctx1 = new BoundsContext(
                merchantId, customerId, paymentAttemptId, ActionType.RETRY_IMMEDIATE,
                null, "issuer_alpha|UPI|RAZORPAY", 0, dayTime, IST);
        BoundsEvaluationResult res1 = boundsEngine.evaluate(ctx1);
        assertThat(res1.isPermitted()).isTrue();

        // 2nd attempt: permitted
        BoundsContext ctx2 = new BoundsContext(
                merchantId, customerId, paymentAttemptId, ActionType.RETRY_IMMEDIATE,
                null, "issuer_alpha|UPI|RAZORPAY", 2, dayTime, IST);
        BoundsEvaluationResult res2 = boundsEngine.evaluate(ctx2);
        assertThat(res2.isPermitted()).isTrue();

        // 3rd attempt (attempt count = 3 >= MAX_RECOVERY_ATTEMPTS): REJECTED
        BoundsContext ctx3 = new BoundsContext(
                merchantId, customerId, paymentAttemptId, ActionType.RETRY_IMMEDIATE,
                null, "issuer_alpha|UPI|RAZORPAY", 3, dayTime, IST);
        BoundsEvaluationResult res3 = boundsEngine.evaluate(ctx3);
        assertThat(res3.isPermitted()).isFalse();
        assertThat(res3.rejectedByGuard()).contains("AttemptCapGuard");
    }

    @Test
    void quiet_hours_reject_customer_nudge_between_2200_and_0800_ist() {
        String customerId = "cust_qh_1";
        Instant nightTime = ZonedDateTime.of(2026, 8, 30, 23, 30, 0, 0, IST).toInstant();
        Instant morningTime = ZonedDateTime.of(2026, 8, 30, 11, 0, 0, 0, IST).toInstant();

        // Nudge at 23:30 IST -> REJECTED
        BoundsContext nightCtx = new BoundsContext(
                merchantId, customerId, "att_qh_1", ActionType.CUSTOMER_NUDGE,
                Channel.WHATSAPP, "issuer_alpha|UPI|RAZORPAY", 0, nightTime, IST);
        BoundsEvaluationResult nightRes = boundsEngine.evaluate(nightCtx);
        assertThat(nightRes.isPermitted()).isFalse();
        assertThat(nightRes.rejectedByGuard()).contains("QuietHoursGuard");

        // Nudge at 11:00 IST -> PERMITTED
        BoundsContext morningCtx = new BoundsContext(
                merchantId, customerId, "att_qh_1", ActionType.CUSTOMER_NUDGE,
                Channel.WHATSAPP, "issuer_alpha|UPI|RAZORPAY", 0, morningTime, IST);
        BoundsEvaluationResult morningRes = boundsEngine.evaluate(morningCtx);
        assertThat(morningRes.isPermitted()).isTrue();

        // Financial retry at 23:30 IST -> PERMITTED (non-intrusive backend action)
        BoundsContext retryNightCtx = new BoundsContext(
                merchantId, customerId, "att_qh_1", ActionType.RETRY_IMMEDIATE,
                null, "issuer_alpha|UPI|RAZORPAY", 0, nightTime, IST);
        BoundsEvaluationResult retryNightRes = boundsEngine.evaluate(retryNightCtx);
        assertThat(retryNightRes.isPermitted()).isTrue();
    }

    @Test
    void opt_out_registry_strictly_blocks_opted_out_customers() {
        String customerId = "cust_opted_out_1";
        Instant dayTime = ZonedDateTime.of(2026, 8, 30, 14, 0, 0, 0, IST).toInstant();

        // Register opt-out for WHATSAPP
        optOutService.registerOptOut(merchantId, customerId, Channel.WHATSAPP, "Customer requested WhatsApp DND");

        // Attempt WhatsApp Nudge -> REJECTED
        BoundsContext waCtx = new BoundsContext(
                merchantId, customerId, "att_opt_1", ActionType.CUSTOMER_NUDGE,
                Channel.WHATSAPP, "issuer_alpha|UPI|RAZORPAY", 0, dayTime, IST);
        BoundsEvaluationResult waRes = boundsEngine.evaluate(waCtx);
        assertThat(waRes.isPermitted()).isFalse();
        assertThat(waRes.rejectedByGuard()).contains("OptOutGuard");

        // SMS Nudge for same customer -> PERMITTED
        BoundsContext smsCtx = new BoundsContext(
                merchantId, customerId, "att_opt_1", ActionType.CUSTOMER_NUDGE,
                Channel.SMS, "issuer_alpha|UPI|RAZORPAY", 0, dayTime, IST);
        BoundsEvaluationResult smsRes = boundsEngine.evaluate(smsCtx);
        assertThat(smsRes.isPermitted()).isTrue();
    }

    @Test
    void contact_budget_blocks_after_exceeding_allowance() {
        String customerId = "cust_budget_1";
        Instant dayTime = ZonedDateTime.of(2026, 8, 30, 14, 0, 0, 0, IST).toInstant();

        // Consume 2 units in budget window
        transactionTemplate.execute(status -> {
            contactBudgetService.consumeBudget(merchantId, customerId, dayTime);
            contactBudgetService.consumeBudget(merchantId, customerId, dayTime);
            return null;
        });

        // 3rd contact attempt -> REJECTED
        BoundsContext ctx = new BoundsContext(
                merchantId, customerId, "att_bud_1", ActionType.CUSTOMER_NUDGE,
                Channel.SMS, "issuer_alpha|UPI|RAZORPAY", 0, dayTime, IST);
        BoundsEvaluationResult res = boundsEngine.evaluate(ctx);
        assertThat(res.isPermitted()).isFalse();
        assertThat(res.rejectedByGuard()).contains("ContactBudgetGuard");
    }

    @Test
    void kill_switch_immediately_halts_all_actions() {
        Instant dayTime = ZonedDateTime.of(2026, 8, 30, 14, 0, 0, 0, IST).toInstant();

        // Activate merchant kill switch
        killSwitchService.activateKillSwitch(merchantId, KillSwitchScope.MERCHANT, null, "Emergency maintenance");

        BoundsContext ctx = new BoundsContext(
                merchantId, "cust_ks_1", "att_ks_1", ActionType.RETRY_IMMEDIATE,
                null, "issuer_alpha|UPI|RAZORPAY", 0, dayTime, IST);
        BoundsEvaluationResult res = boundsEngine.evaluate(ctx);
        assertThat(res.isPermitted()).isFalse();
        assertThat(res.rejectedByGuard()).contains("KillSwitchGuard");
    }
}
