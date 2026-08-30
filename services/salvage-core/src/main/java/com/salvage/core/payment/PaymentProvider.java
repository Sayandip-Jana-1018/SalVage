package com.salvage.core.payment;

import com.salvage.core.payment.model.PaymentLinkCommand;
import com.salvage.core.payment.model.PaymentLinkResult;
import com.salvage.core.payment.model.PaymentSnapshot;
import com.salvage.core.payment.model.RefundCommand;
import com.salvage.core.payment.model.RefundResult;
import com.salvage.core.payment.model.RetryCommand;
import com.salvage.core.payment.model.RetryResult;

/**
 * The one place this system touches money.
 *
 * <p>Everything above this interface decides; only what is behind it acts. The
 * boundary exists so that the decision layer, the bounds engine and the ledger
 * can be tested and reasoned about without a gateway, and so that pointing the
 * system at a different provider is an adapter rather than a rewrite. See
 * <a href="../../../../../../../../docs/adr/0003-payment-provider-abstraction.md">ADR-0003</a>.
 *
 * <h2>Two adapters</h2>
 *
 * <p>{@code SimulatedProvider} is the default: deterministic, in-process, no
 * credentials, and it models the lifecycle including the failure modes that
 * matter. {@code RazorpayTestProvider} issues real HTTP calls against
 * Razorpay's test mode. The quickstart works with neither key nor network.
 *
 * <h2>Rules every implementation must hold</h2>
 *
 * <ol>
 *   <li><b>Idempotency is the caller's key, not the adapter's.</b> Every
 *       mutating method takes a caller-supplied idempotency key derived
 *       deterministically from the attempt and the action. The same key must
 *       never move money twice. This is what makes redelivery safe.
 *   <li><b>Never turn "I don't know" into "it failed."</b> A timed-out call
 *       must surface as {@link com.salvage.core.payment.model.PaymentState#UNKNOWN}
 *       or as an indeterminate
 *       {@link com.salvage.core.payment.model.ProviderException}. An adapter
 *       that reports a timeout as a decline will eventually charge a customer
 *       twice, and nothing above it can detect that.
 *   <li><b>Amounts are {@code long} paise.</b> Never a floating-point type,
 *       anywhere, for any reason.
 *   <li><b>Reads are free of side effects.</b> {@link #fetchStatus} must never
 *       create, capture or modify anything; the reconciliation guard calls it
 *       precisely when the system is unsure whether money has moved.
 * </ol>
 */
public interface PaymentProvider {

    /** Short stable identifier for this adapter, recorded on every operation row. */
    String name();

    /**
     * Ask the provider what actually happened to a payment.
     *
     * <p>The reconciliation read. Must have no side effects, and must return
     * {@link com.salvage.core.payment.model.PaymentState#UNKNOWN} rather than
     * guessing when the provider does not answer or does not recognise the id.
     *
     * @throws com.salvage.core.payment.model.ProviderException if the call itself fails
     */
    PaymentSnapshot fetchStatus(String merchantId, String providerPaymentId);

    /**
     * Attempt the payment again, optionally on a different rail.
     *
     * <p>Callers must not invoke this without first establishing that the
     * original payment did not succeed. {@code ReconciliationGuard} is that
     * check and it is not optional.
     */
    RetryResult retry(RetryCommand command);

    /**
     * Create a link the customer can pay through.
     *
     * <p>The effect of a {@code CUSTOMER_NUDGE}: a real payable link, not a
     * message asking the customer to start over.
     */
    PaymentLinkResult createPaymentLink(PaymentLinkCommand command);

    /**
     * Return money.
     *
     * <p>The saga's compensating action, and the correction available when
     * reconciliation finds a payment that succeeded after this system had
     * already acted on the belief that it failed.
     */
    RefundResult refund(RefundCommand command);

    /**
     * Verify that a webhook body was signed by the provider.
     *
     * <p>Must be constant-time in the comparison and must return false rather
     * than throwing on a malformed signature: an unsigned or badly signed
     * request is an ordinary rejection, not an exceptional condition.
     *
     * @param rawBody the exact bytes received, before any parsing or
     *     re-serialisation -- re-encoding JSON changes the bytes and
     *     invalidates the signature
     */
    boolean verifyWebhookSignature(String rawBody, String signature);
}
