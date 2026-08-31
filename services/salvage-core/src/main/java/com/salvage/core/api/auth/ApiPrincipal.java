package com.salvage.core.api.auth;

import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Who is calling, resolved from an API key. Never carries the key.
 *
 * <p>This object is logged, so it must be safe to log: {@code keyId} is the
 * first eight characters of the key's SHA-256, which identifies the credential
 * in an audit trail without being enough to reconstruct it or to forge a
 * configuration entry.
 *
 * @param scope what this key may address
 * @param merchantId the tenant a {@link Scope#MERCHANT} key is bound to; null for an operator
 * @param keyId first eight hex characters of the key digest
 */
public record ApiPrincipal(Scope scope, String merchantId, String keyId) {

    /** The principal used when authentication is switched off. Named so a log says so. */
    public static ApiPrincipal unauthenticated() {
        return new ApiPrincipal(Scope.OPERATOR, null, "noauth");
    }

    public boolean mayAddress(String tenant) {
        return scope == Scope.OPERATOR || Objects.equals(merchantId, tenant);
    }

    /**
     * Refuse a caller reaching for a tenant that is not theirs.
     *
     * <p>404 rather than 403, matching what the read path already returns for a
     * record that does not exist. The refusal is deliberately indistinguishable
     * from the answer for a merchant that was never provisioned.
     */
    public void requireTenant(String tenant) {
        if (!mayAddress(tenant)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such merchant");
        }
    }
}
