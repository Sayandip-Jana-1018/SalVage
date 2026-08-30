package com.salvage.core.payment;

import com.salvage.core.payment.razorpay.RazorpayTestProvider;
import com.salvage.core.payment.simulated.SimulatedProvider;
import java.time.Clock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Chooses which payment provider this process talks to.
 *
 * <p>Default is {@link SimulatedProvider}: the quickstart must work for
 * someone who has just cloned the repository and holds no credentials to
 * anything. Switching to Razorpay is an explicit act requiring three
 * environment variables, and {@code ProviderCredentialsGuard} independently
 * refuses to start the process at all if the key is a live one.
 */
@Configuration
public class PaymentProviderConfig {

    private static final Logger log = LoggerFactory.getLogger(PaymentProviderConfig.class);

    static final String SIMULATED = "simulated";
    static final String RAZORPAY = "razorpay";

    @Bean
    @ConditionalOnMissingBean(Clock.class)
    public Clock clock() {
        // Injected rather than reached for statically so that tests can pin
        // time. Nothing in the money path should call Instant.now() directly.
        return Clock.systemUTC();
    }

    @Bean
    public PaymentProvider paymentProvider(
            @Value("${salvage.payment.provider:simulated}") String providerName,
            @Value("${salvage.payment.simulated.seed:20260831}") long seed,
            @Value("${salvage.payment.simulated.success-rate:0.55}") double successRate,
            @Value("${salvage.payment.simulated.timeout-rate:0.10}") double timeoutRate,
            @Value("${salvage.payment.simulated.timeout-captured-rate:0.30}")
                    double timeoutCapturedRate,
            @Value("${salvage.razorpay.key-id:}") String razorpayKeyId,
            @Value("${salvage.razorpay.key-secret:}") String razorpayKeySecret,
            @Value("${salvage.razorpay.webhook-secret:}") String razorpayWebhookSecret,
            @Value("${salvage.razorpay.base-url:https://api.razorpay.com/v1}") String razorpayBaseUrl,
            Clock clock) {

        if (RAZORPAY.equalsIgnoreCase(providerName)) {
            if (razorpayKeyId.isBlank() || razorpayKeySecret.isBlank()) {
                // Fail closed and loudly. Falling back to the simulator here
                // would be far worse than not starting: the operator asked for
                // a real gateway, and a system that quietly simulates instead
                // reports recoveries that never happened.
                throw new IllegalStateException(
                        "salvage.payment.provider=razorpay requires RAZORPAY_KEY_ID and "
                                + "RAZORPAY_KEY_SECRET. Refusing to start rather than silently "
                                + "falling back to the simulator.");
            }
            log.warn(
                    "Payment provider is razorpay ({}). Real HTTP calls will be made.",
                    razorpayBaseUrl);
            return new RazorpayTestProvider(
                    razorpayBaseUrl, razorpayKeyId, razorpayKeySecret, razorpayWebhookSecret, clock);
        }

        if (!SIMULATED.equalsIgnoreCase(providerName)) {
            throw new IllegalStateException(
                    "Unknown salvage.payment.provider '"
                            + providerName
                            + "'. Valid values: simulated, razorpay.");
        }

        log.info(
                "Payment provider is the simulator (seed={}). No gateway will be contacted.", seed);
        return new SimulatedProvider(seed, successRate, timeoutRate, timeoutCapturedRate, clock);
    }
}
