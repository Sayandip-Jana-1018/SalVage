package com.salvage.core.api.auth;

/**
 * What an API key is allowed to address.
 *
 * <p>Two values, and the distinction is the whole point of having scopes at
 * all: {@code MERCHANT} is bound to one tenant, {@code OPERATOR} is not. Adding
 * a third should require an argument, because every scope is a new way for a
 * caller to reach data somebody assumed they could not.
 */
public enum Scope {

    /**
     * Bound to exactly one merchant. A request for any other tenant is answered
     * 404, never 403 -- a 403 confirms the other tenant exists, which is the
     * fact somebody enumerating merchant ids is trying to establish.
     */
    MERCHANT,

    /**
     * May address every tenant. What an internal console runs as, because an
     * operator switching merchants during an incident is a real workflow. It is
     * a separate scope so that granting it is deliberate and visible in a log,
     * and so that it is never issued to a merchant.
     */
    OPERATOR
}
