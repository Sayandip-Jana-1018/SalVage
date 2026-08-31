package com.salvage.core.api.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.salvage.core.ingest.SalvageInfrastructure;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * The gate, over real HTTP, against the real controllers.
 *
 * <p>The load-bearing test is {@link #aMerchantKeyCannotReadAnotherTenantsLedger()}.
 * Before Phase 13, {@code /api/v1/ledger/merchants/{id}/entries} served whoever
 * asked: the tenant was a path parameter and nothing checked entitlement, so
 * reading another merchant's hash-chained ledger was a matter of editing a URL.
 * {@code MultiTenantIsolationTest} proved the repository layer scoped its
 * queries, which was true and beside the point when the caller could name any
 * tenant they liked.
 *
 * <p>Keys are configured through {@code @SpringBootTest(properties = ...)} so
 * this exercises the same {@code ApiAuthProperties} binding a deployment uses,
 * rather than constructing a store by hand and testing a path production does
 * not take.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "salvage.auth.required=true",
            // Digests of ACME_KEY and OPERATOR_KEY below. Written out rather
            // than computed so that the fixture is checkable by eye against
            // scripts/generate_api_key.sh.
            "salvage.auth.api-keys="
                    + "merchant:merch_acme:"
                    + ApiAuthenticationTest.ACME_DIGEST
                    + ",operator:*:"
                    + ApiAuthenticationTest.OPERATOR_DIGEST
        })
class ApiAuthenticationTest extends SalvageInfrastructure {

    static final String ACME_KEY = "svg_test_acme_not_a_real_credential";
    static final String OPERATOR_KEY = "svg_test_operator_not_a_real_credential";

    // The real SHA-256 of the two keys above, pinned as literals because a
    // @SpringBootTest property has to be a compile-time constant. Checked
    // against ApiKeyStore.digest by digestsMatchTheKeysAbove(), so a typo here
    // fails with "the fixture is wrong" rather than with a confusing 401.
    static final String ACME_DIGEST =
            "88c080017bcbb5ab561afe947458721144effc0470a855799f923b710c68fb17";
    static final String OPERATOR_DIGEST =
            "8add4f2ee115e23cd79118c2f0c4f002236d541491b796885bf99ef0de3ce120";

    @LocalServerPort private int port;

    @Autowired private TestRestTemplate rest;

    private String url(String path) {
        return "http://localhost:" + port + path;
    }

    private ResponseEntity<String> get(String path, String key) {
        HttpHeaders headers = new HttpHeaders();
        if (key != null) {
            headers.setBearerAuth(key);
        }
        return rest.exchange(url(path), HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }

    @Test
    void digestsMatchTheKeysAbove() {
        // A hand-written digest that does not match its key makes every other
        // test here fail as a 401, which reads like a broken filter rather than
        // a broken fixture. This one line says which it is.
        assertThat(ApiKeyStore.digest(ACME_KEY)).isEqualTo(ACME_DIGEST);
        assertThat(ApiKeyStore.digest(OPERATOR_KEY)).isEqualTo(OPERATOR_DIGEST);
    }

    @Test
    void aMerchantKeyCannotReadAnotherTenantsLedger() {
        ResponseEntity<String> own = get("/api/v1/ledger/merchants/merch_acme/entries", ACME_KEY);
        assertThat(own.getStatusCode())
                .as("a merchant must be able to read its own ledger")
                .isEqualTo(HttpStatus.OK);

        ResponseEntity<String> theirs =
                get("/api/v1/ledger/merchants/merch_other/entries", ACME_KEY);
        assertThat(theirs.getStatusCode())
                .as("404, not 403: a 403 confirms merch_other exists")
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void everyTenantAddressedRouteIsGuarded() {
        // One route protected and the next one not is the usual shape of this bug.
        for (String path :
                new String[] {
                    "/api/v1/ledger/merchants/merch_other/entries",
                    "/api/v1/ledger/merchants/merch_other/verify",
                    "/api/v1/ledger/merchants/merch_other/count",
                    "/api/v1/telemetry/merchants/merch_other/stats"
                }) {
            assertThat(get(path, ACME_KEY).getStatusCode()).as(path).isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    @Test
    void anOperatorKeyMayReadAnyTenant() {
        assertThat(get("/api/v1/telemetry/merchants/merch_acme/stats", OPERATOR_KEY).getStatusCode())
                .isEqualTo(HttpStatus.OK);
        assertThat(get("/api/v1/telemetry/merchants/merch_other/stats", OPERATOR_KEY).getStatusCode())
                .isEqualTo(HttpStatus.OK);
    }

    @Test
    void noKeyIsRefused() {
        ResponseEntity<String> response = get("/api/v1/ledger/merchants/merch_acme/entries", null);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(response.getHeaders().getFirst(HttpHeaders.WWW_AUTHENTICATE)).isEqualTo("Bearer");
    }

    @Test
    void anUnknownKeyIsRefused() {
        assertThat(get("/api/v1/telemetry/merchants/merch_acme/stats", "not-a-key").getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void healthProbesStayOpen() {
        // A load balancer holds no credential. The readiness probe already
        // reports a dependency's exception type rather than its message,
        // precisely because it answers unauthenticated callers.
        assertThat(get("/health/liveness", null).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void theWebhookEndpointIsNotBehindTheApiKeyFilter() {
        // A payment gateway does not hold a Salvage API key. That endpoint
        // authenticates a signature -- constant-time HMAC over the raw bytes,
        // verified before anything is parsed -- and putting it behind this
        // filter would break inbound webhooks while buying nothing.
        //
        // An unsigned POST is refused either way, so the status alone proves
        // nothing -- the signature check answers 401 as well. What tells them
        // apart is the header: ApiKeyAuthFilter always sets WWW-Authenticate
        // on a refusal, and the controller's signature check does not.
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
        ResponseEntity<String> response =
                rest.exchange(
                        url("/api/v1/webhooks/payments"),
                        HttpMethod.POST,
                        new HttpEntity<>("{}", headers),
                        String.class);

        assertThat(response.getHeaders().getFirst(HttpHeaders.WWW_AUTHENTICATE))
                .as("the webhook route must be refused by its signature check, not the key filter")
                .isNull();
    }
}
