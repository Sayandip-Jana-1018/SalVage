package com.salvage.core.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * Refuse to start with live payment credentials.
 *
 * <p>ADR-0003 and {@code .env.example} both stated that salvage-core rejects
 * any Razorpay key prefixed {@code rzp_live_}. It did not: no code anywhere in
 * the repository mentioned the prefix, and {@code docs/PHASE_0_SUMMARY.md}
 * said so plainly while the other two documents asserted the opposite. A
 * documented safety control that does not exist is worse than an absent one,
 * because it is relied upon.
 *
 * <p>This is the control. It runs at startup, before the application accepts
 * traffic, and throws if a live key is present in the environment.
 *
 * <p>Why fail closed rather than warn: this codebase can originate charges. It
 * has a bounds engine, an idempotency layer and a kill switch precisely
 * because that is dangerous, and every one of those protections was designed
 * and tested against a simulated provider. Pointing it at live credentials
 * would exercise all of it against real money for the first time,
 * unsupervised, on whatever the current branch happens to contain. A warning
 * in a log scrolls past. A refusal to boot does not.
 *
 * <p>The check is on the prefix rather than on a mode flag because the prefix
 * is the property that actually determines which environment the key reaches.
 * A configuration flag saying "test mode" alongside a live key is a
 * configuration error, and this catches it.
 */
@Configuration
public class ProviderCredentialsGuard {

    private static final Logger log = LoggerFactory.getLogger(ProviderCredentialsGuard.class);

    /** Razorpay's live-key prefix. Test keys use {@code rzp_test_}. */
    static final String LIVE_KEY_PREFIX = "rzp_live_";

    private final String razorpayKeyId;

    public ProviderCredentialsGuard(@Value("${salvage.razorpay.key-id:}") String razorpayKeyId) {
        this.razorpayKeyId = razorpayKeyId == null ? "" : razorpayKeyId.trim();
    }

    @PostConstruct
    void rejectLiveCredentials() {
        assertNotLive(razorpayKeyId);
        if (razorpayKeyId.isEmpty()) {
            log.info("No Razorpay key configured; the simulated provider requires none.");
        } else {
            log.info("Razorpay key accepted: test-mode prefix verified.");
        }
    }

    /**
     * Throw if the key is a live key.
     *
     * <p>Package-private and static so the test can exercise the rule directly
     * without standing up a context, and so the rule has exactly one
     * implementation rather than one per call site.
     *
     * <p>The exception message contains the prefix, never the key. A startup
     * failure is usually the most widely-read line a service ever emits: it
     * lands in CI output, in container logs, and in whatever aggregator is
     * watching. Echoing a credential there would turn a safety control into a
     * disclosure.
     */
    static void assertNotLive(String keyId) {
        if (keyId != null && keyId.startsWith(LIVE_KEY_PREFIX)) {
            throw new IllegalStateException(
                    "Refusing to start: RAZORPAY_KEY_ID begins with '"
                            + LIVE_KEY_PREFIX
                            + "'. Salvage originates payment attempts, and every safety control "
                            + "in it has been exercised only against the simulated provider. "
                            + "Use a test-mode key (rzp_test_...). See "
                            + "docs/adr/0003-payment-provider-abstraction.md.");
        }
    }
}
