package com.salvage.core.payment.simulated;

import com.salvage.core.payment.PaymentProvider;
import com.salvage.core.payment.model.PaymentLinkCommand;
import com.salvage.core.payment.model.PaymentLinkResult;
import com.salvage.core.payment.model.PaymentSnapshot;
import com.salvage.core.payment.model.PaymentState;
import com.salvage.core.payment.model.RefundCommand;
import com.salvage.core.payment.model.RefundResult;
import com.salvage.core.payment.model.RetryCommand;
import com.salvage.core.payment.model.RetryResult;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The default provider: deterministic, in-process, and credential-free.
 *
 * <p>This is not a mock and not a stub. It models the payment lifecycle,
 * enforces idempotency the way a real gateway does, and reproduces the failure
 * modes that make this problem hard. A stranger who clones the repository gets
 * a system that executes recovery actions end to end without an account
 * anywhere.
 *
 * <h2>The case this exists to reproduce</h2>
 *
 * <p>A share of retries return {@link PaymentState#UNKNOWN} -- the call timed
 * out. Of those, some <em>actually captured the money</em>. The provider knows
 * which; the caller does not, and cannot, until it reads the status back.
 *
 * <p>That asymmetry is the entire reason {@code ReconciliationGuard} exists.
 * Without it, a system that treats a timeout as a decline retries a payment
 * that already took the customer's money. This provider makes that bug
 * reproducible in a test rather than a story told about production.
 *
 * <h2>Determinism</h2>
 *
 * <p>Every outcome is derived from SHA-256 over the seed and the caller's
 * idempotency key. No {@code Random}, no clock reads in the decision. The same
 * key always produces the same outcome, so a redelivered command reproduces
 * the first result exactly -- which is also how idempotency is enforced here,
 * the same way it is at a real gateway.
 */
public class SimulatedProvider implements PaymentProvider {

    private static final Logger log = LoggerFactory.getLogger(SimulatedProvider.class);

    public static final String NAME = "simulated";

    /**
     * Behaviour rates.
     *
     * <p><b>Structural assumptions, not measurements.</b> They are chosen so
     * that every branch of the calling code is exercised in a short run --
     * including the rare and dangerous one -- not to describe any real
     * gateway's behaviour. Nothing in this repository has measured a
     * provider's timeout rate. See {@code docs/adr/0006-numbers-policy.md}.
     */
    private final double successRate;

    private final double timeoutRate;
    private final double timeoutActuallyCapturedRate;

    private final long seed;
    private final Clock clock;

    /** idempotency key -> the result first produced for it. */
    private final Map<String, RetryResult> byIdempotencyKey = new ConcurrentHashMap<>();

    /** provider payment id -> the truth, including truths the caller has not been told. */
    private final Map<String, PaymentSnapshot> byPaymentId = new ConcurrentHashMap<>();

    private final Map<String, PaymentLinkResult> linksByIdempotencyKey = new ConcurrentHashMap<>();
    private final Map<String, RefundResult> refundsByIdempotencyKey = new ConcurrentHashMap<>();

    public SimulatedProvider(
            long seed,
            double successRate,
            double timeoutRate,
            double timeoutActuallyCapturedRate,
            Clock clock) {
        this.seed = seed;
        this.successRate = requireFraction(successRate, "successRate");
        this.timeoutRate = requireFraction(timeoutRate, "timeoutRate");
        this.timeoutActuallyCapturedRate =
                requireFraction(timeoutActuallyCapturedRate, "timeoutActuallyCapturedRate");
        this.clock = Objects.requireNonNull(clock, "clock must not be null");
        if (successRate + timeoutRate > 1.0) {
            throw new IllegalArgumentException(
                    "successRate + timeoutRate must not exceed 1.0, got "
                            + (successRate + timeoutRate));
        }
    }

    private static double requireFraction(double value, String field) {
        if (!(value >= 0.0 && value <= 1.0)) {
            throw new IllegalArgumentException(field + " must be in [0,1], got " + value);
        }
        return value;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public PaymentSnapshot fetchStatus(String merchantId, String providerPaymentId) {
        Objects.requireNonNull(merchantId, "merchantId must not be null");
        if (providerPaymentId == null) {
            return PaymentSnapshot.unknown(null, clock.instant());
        }
        PaymentSnapshot known = byPaymentId.get(providerPaymentId);
        if (known == null) {
            // An id this provider never issued. NOT_FOUND rather than
            // UNKNOWN: this provider is stating positively that it holds no
            // payment under this id, so nothing was charged under it. That is
            // information, and it is what lets a retry proceed for an attempt
            // that reached us from somewhere else -- a webhook, an imported
            // failure, a simulated run.
            return new PaymentSnapshot(
                    providerPaymentId, PaymentState.NOT_FOUND, 0L, null, clock.instant());
        }
        // The read reveals what the retry call may have concealed: a payment
        // whose call timed out but which captured anyway is reported here as
        // CAPTURED, because that is what is true.
        return new PaymentSnapshot(
                known.providerPaymentId(),
                known.state(),
                known.amountPaise(),
                known.providerErrorCode(),
                clock.instant());
    }

    @Override
    public RetryResult retry(RetryCommand command) {
        Objects.requireNonNull(command, "command must not be null");

        // Idempotency, enforced the way a gateway enforces it: the same key
        // returns the first result rather than acting again.
        RetryResult existing = byIdempotencyKey.get(command.idempotencyKey());
        if (existing != null) {
            log.debug("simulated provider replaying result for key {}", command.idempotencyKey());
            return existing;
        }

        double draw = fraction("retry", command.idempotencyKey());
        Instant now = clock.instant();
        String paymentId = "sim_pay_" + shortHash("payid", command.idempotencyKey());

        RetryResult result;
        if (draw < successRate) {
            result = new RetryResult(paymentId, PaymentState.CAPTURED, command.amountPaise(), null, now);
            byPaymentId.put(
                    paymentId,
                    new PaymentSnapshot(paymentId, PaymentState.CAPTURED, command.amountPaise(), null, now));

        } else if (draw < successRate + timeoutRate) {
            // The dangerous branch. The caller is told UNKNOWN. Whether the
            // money actually moved is decided here and recorded only in the
            // provider's own state, discoverable through fetchStatus and
            // nowhere else -- which is precisely the position a real caller
            // is in after a gateway timeout.
            boolean actuallyCaptured =
                    fraction("timeout_truth", command.idempotencyKey()) < timeoutActuallyCapturedRate;

            PaymentState truth = actuallyCaptured ? PaymentState.CAPTURED : PaymentState.FAILED;
            byPaymentId.put(
                    paymentId,
                    new PaymentSnapshot(
                            paymentId,
                            truth,
                            actuallyCaptured ? command.amountPaise() : 0L,
                            actuallyCaptured ? null : "SIM_DECLINED",
                            now));

            result = new RetryResult(paymentId, PaymentState.UNKNOWN, 0L, null, now);
            log.debug(
                    "simulated provider returning UNKNOWN for key {} (truth={})",
                    command.idempotencyKey(),
                    truth);

        } else {
            result = new RetryResult(paymentId, PaymentState.FAILED, 0L, "SIM_DECLINED", now);
            byPaymentId.put(
                    paymentId,
                    new PaymentSnapshot(paymentId, PaymentState.FAILED, 0L, "SIM_DECLINED", now));
        }

        byIdempotencyKey.put(command.idempotencyKey(), result);
        return result;
    }

    @Override
    public PaymentLinkResult createPaymentLink(PaymentLinkCommand command) {
        Objects.requireNonNull(command, "command must not be null");
        return linksByIdempotencyKey.computeIfAbsent(
                command.idempotencyKey(),
                key -> {
                    Instant now = clock.instant();
                    String linkId = "sim_link_" + shortHash("linkid", key);
                    String paymentId = "sim_pay_" + shortHash("linkpay", key);
                    // A link is payable, not paid. It sits PENDING until
                    // something pays it; nothing here pretends a customer did.
                    byPaymentId.put(
                            paymentId,
                            new PaymentSnapshot(
                                    paymentId, PaymentState.PENDING, command.amountPaise(), null, now));
                    return new PaymentLinkResult(
                            linkId,
                            "https://simulated.invalid/pay/" + linkId,
                            now.plus(command.expiresAfter()),
                            now);
                });
    }

    @Override
    public RefundResult refund(RefundCommand command) {
        Objects.requireNonNull(command, "command must not be null");
        return refundsByIdempotencyKey.computeIfAbsent(
                command.idempotencyKey(),
                key -> {
                    Instant now = clock.instant();
                    PaymentSnapshot original = byPaymentId.get(command.providerPaymentId());
                    if (original == null || !original.state().isTerminalSuccess()) {
                        throw new IllegalStateException(
                                "Refusing to refund "
                                        + command.providerPaymentId()
                                        + ": provider holds no captured payment under that id");
                    }
                    byPaymentId.put(
                            command.providerPaymentId(),
                            new PaymentSnapshot(
                                    command.providerPaymentId(),
                                    PaymentState.REFUNDED,
                                    original.amountPaise(),
                                    null,
                                    now));
                    return new RefundResult(
                            "sim_rfnd_" + shortHash("refundid", key), command.amountPaise(), now);
                });
    }

    @Override
    public boolean verifyWebhookSignature(String rawBody, String signature) {
        if (rawBody == null || signature == null) {
            return false;
        }
        // The simulated provider signs with the same construction the real one
        // verifies, so the webhook path is exercised identically under both.
        return MessageDigest.isEqual(
                expectedSignature(rawBody).getBytes(StandardCharsets.UTF_8),
                signature.getBytes(StandardCharsets.UTF_8));
    }

    /** The signature this provider would have sent for a body. Test support. */
    public String expectedSignature(String rawBody) {
        return shortHash("webhook", rawBody, 64);
    }

    // -- determinism -------------------------------------------------------

    private double fraction(String stream, String key) {
        byte[] digest = digest(stream, key);
        // Top 53 bits, which is what a double can hold exactly.
        long bits = 0L;
        for (int i = 0; i < 7; i++) {
            bits = (bits << 8) | (digest[i] & 0xFFL);
        }
        return (double) (bits >>> 3) / (double) (1L << 53);
    }

    private String shortHash(String stream, String key) {
        return shortHash(stream, key, 16);
    }

    private String shortHash(String stream, String key, int hexChars) {
        byte[] digest = digest(stream, key);
        StringBuilder out = new StringBuilder(hexChars);
        for (int i = 0; out.length() < hexChars && i < digest.length; i++) {
            out.append(String.format("%02x", digest[i]));
        }
        return out.substring(0, hexChars);
    }

    private byte[] digest(String stream, String key) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            sha.update(Long.toString(seed).getBytes(StandardCharsets.UTF_8));
            sha.update((byte) 0);
            sha.update(stream.getBytes(StandardCharsets.UTF_8));
            sha.update((byte) 0);
            sha.update(key.getBytes(StandardCharsets.UTF_8));
            return sha.digest();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by the JLS and is missing", e);
        }
    }
}
