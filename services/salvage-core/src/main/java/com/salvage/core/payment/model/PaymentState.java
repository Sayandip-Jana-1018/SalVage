package com.salvage.core.payment.model;

/**
 * What a provider says about a payment, right now.
 *
 * <p>The important member is {@link #UNKNOWN}. A gateway call can time out,
 * and when it does the caller learns nothing about the payment -- not that it
 * failed. Collapsing that into {@code FAILED} is the single most expensive
 * mistake available in this domain: it is how a customer gets charged twice,
 * because a system that believes a timed-out payment failed will cheerfully
 * retry one that actually succeeded.
 *
 * <p>So {@code UNKNOWN} is modelled explicitly and handled explicitly.
 * {@code ReconciliationGuard} refuses to retry anything in this state until a
 * fresh read from the provider resolves it.
 */
public enum PaymentState {

    /** The provider has accepted the payment and the money has moved. */
    CAPTURED,

    /**
     * Authorised but not captured. Money is held, not taken.
     *
     * <p>Retrying against this would double-authorise, so it counts as a
     * terminal success for the purposes of "do not retry".
     */
    AUTHORIZED,

    /** The provider says this payment definitively did not succeed. */
    FAILED,

    /** Created but not yet acted on by the customer. A payment link, typically. */
    PENDING,

    /** The money went back. */
    REFUNDED,

    /**
     * The provider affirmatively says no payment exists under this id.
     *
     * <p>A 404, not a timeout. This is <em>information</em>, and it is the
     * distinction that separates it from {@link #UNKNOWN}: if the provider
     * holds no payment under an id, then no money has moved under that id, so
     * there is nothing a retry could charge twice.
     *
     * <p>It is the normal state of the original failed payment when that
     * payment was never created through this provider -- an attempt that
     * arrived by webhook from elsewhere, or a simulated run whose provider
     * instance did not issue the id.
     *
     * <p>This does not rule out the payment existing under some
     * <em>other</em> id the caller does not know. Nothing can rule that out,
     * and no state in this enum should pretend to.
     */
    NOT_FOUND,

    /**
     * The provider did not tell us. A timeout, an unparseable response, or a
     * status this code does not recognise.
     *
     * <p>Not a failure. An absence of information. Distinct from
     * {@link #NOT_FOUND}, which is the presence of information that happens to
     * be negative -- collapsing the two is how a timeout gets treated as
     * permission to charge again.
     */
    UNKNOWN;

    /**
     * True when the money has moved or is committed to moving.
     *
     * <p>Retrying any of these risks charging twice.
     */
    public boolean isTerminalSuccess() {
        return this == CAPTURED || this == AUTHORIZED;
    }

    /**
     * True when a retry is safe on the evidence available.
     *
     * <p>Two states qualify, and both are affirmative statements by the
     * provider: {@link #FAILED} ("this payment did not succeed") and
     * {@link #NOT_FOUND} ("no payment exists under this id, so nothing was
     * charged under it").
     *
     * <p>Deliberately false for {@link #UNKNOWN}: "we do not know" is not
     * permission. That is the fail-closed direction, and it is the whole
     * reason this enum has seven members rather than two booleans.
     */
    public boolean isSafeToRetry() {
        return this == FAILED || this == NOT_FOUND;
    }
}
