package com.salvage.core.api.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * The gate. Every API request carries a key, or it does not get in.
 *
 * <p>Until this filter existed, {@code /api/v1/ledger/merchants/{id}/entries}
 * and {@code /api/v1/telemetry/merchants/{id}/stats} served whoever asked. The
 * tenant was a path parameter and nothing checked entitlement, so reading
 * another merchant's hash-chained ledger was a matter of editing a URL. Tamper
 * evidence is worth nothing when the read side is anonymous.
 *
 * <h2>What is deliberately exempt</h2>
 *
 * <ul>
 *   <li>{@code /health/**} and the actuator: a load balancer has no credential,
 *       and the readiness probe already reports a dependency's exception
 *       <em>type</em> rather than its message precisely because it is
 *       unauthenticated.</li>
 *   <li>{@code /api/v1/webhooks/**}: a payment gateway does not hold a Salvage
 *       API key. That endpoint authenticates a <em>signature</em> --
 *       constant-time HMAC-SHA256 over the raw bytes, verified before anything
 *       is parsed -- which is a stronger check than a bearer token and the only
 *       one the sender can satisfy. Putting it behind this filter would break
 *       inbound webhooks and buy nothing.</li>
 * </ul>
 *
 * <p>Spring Security is not used. This is one filter with one job, and a
 * dependency that brings a filter chain, a context holder and an expression
 * language would make the security-relevant behaviour of this service harder to
 * read, not easier.
 */
@Component
@Order(1)
public class ApiKeyAuthFilter extends OncePerRequestFilter {

    /** Where the resolved principal is published for the argument resolver. */
    public static final String PRINCIPAL_ATTRIBUTE = "salvage.api.principal";

    private static final String BEARER = "Bearer ";

    private final ApiAuthProperties properties;

    public ApiKeyAuthFilter(ApiAuthProperties properties) {
        this.properties = properties;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/health")
                || path.startsWith("/actuator")
                || path.startsWith("/api/v1/webhooks");
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain chain)
            throws ServletException, IOException {

        if (!properties.isRequired()) {
            request.setAttribute(PRINCIPAL_ATTRIBUTE, ApiPrincipal.unauthenticated());
            chain.doFilter(request, response);
            return;
        }

        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER)) {
            unauthorized(response, "Authorization: Bearer <api key> is required.");
            return;
        }

        Optional<ApiPrincipal> principal = properties.store().resolve(header.substring(BEARER.length()).trim());
        if (principal.isEmpty()) {
            unauthorized(response, "That API key is not recognised.");
            return;
        }

        request.setAttribute(PRINCIPAL_ATTRIBUTE, principal.get());
        chain.doFilter(request, response);
    }

    /**
     * Refuse without saying anything useful to whoever is guessing.
     *
     * <p>One message for "no header" and one for "wrong key", both of which say
     * only what the caller must do differently. Neither confirms whether a key
     * exists, whether it expired, or which tenant it belongs to.
     */
    private void unauthorized(HttpServletResponse response, String detail) throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"error\":\"" + detail + "\"}");
    }
}
