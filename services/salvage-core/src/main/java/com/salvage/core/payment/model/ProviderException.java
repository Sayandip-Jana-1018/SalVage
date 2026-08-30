package com.salvage.core.payment.model;

/**
 * A provider call that did not produce an answer.
 *
 * <p>Distinct from a payment that failed. A declined card is a successful call
 * returning {@link PaymentState#FAILED}; this is the call itself not working --
 * a timeout, a 5xx, an unparseable body, a rejected credential.
 *
 * <p>{@link #indeterminate} is the field that matters. When true, the request
 * may have reached the provider and may have moved money, so the caller must
 * reconcile before doing anything else. When false, the provider certainly did
 * not act (a rejected credential, a malformed request) and a retry is safe.
 *
 * <p>Getting this backwards is how a double charge happens, so the default is
 * the cautious one: {@link #indeterminate(String, Throwable)} is the
 * constructor to reach for when unsure.
 */
public class ProviderException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final boolean indeterminate;

    private ProviderException(String message, Throwable cause, boolean indeterminate) {
        super(message, cause);
        this.indeterminate = indeterminate;
    }

    /**
     * The call may have moved money. Reconcile before retrying.
     *
     * <p>Timeouts, connection resets, 5xx responses, and anything unexpected.
     */
    public static ProviderException indeterminate(String message, Throwable cause) {
        return new ProviderException(message, cause, true);
    }

    /**
     * The provider certainly did not act, so a retry cannot double-charge.
     *
     * <p>Only for failures that provably happened before the provider began
     * processing: a rejected credential, a request the provider refused to
     * parse, a validation error it returned synchronously.
     */
    public static ProviderException definitelyNotApplied(String message, Throwable cause) {
        return new ProviderException(message, cause, false);
    }

    /** True when the request may have reached the provider and taken effect. */
    public boolean isIndeterminate() {
        return indeterminate;
    }
}
