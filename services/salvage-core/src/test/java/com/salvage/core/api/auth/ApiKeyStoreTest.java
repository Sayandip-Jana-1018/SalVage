package com.salvage.core.api.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.salvage.core.api.auth.ApiKeyStore.ApiKeyConfigurationException;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * Key material: what is stored, what is refused, and what a principal reveals.
 *
 * <p>No Spring context and no containers. The parsing rules are the part most
 * likely to be edited by someone in a hurry, and a test that takes forty
 * seconds to start is a test that gets skipped while they are hurrying.
 */
class ApiKeyStoreTest {

    private static final String OPERATOR_KEY = "svg_test_operator_not_a_real_credential";
    private static final String ACME_KEY = "svg_test_acme_not_a_real_credential";

    private static String configured() {
        return "operator:*:"
                + ApiKeyStore.digest(OPERATOR_KEY)
                + ",merchant:merch_acme:"
                + ApiKeyStore.digest(ACME_KEY);
    }

    @Test
    void configurationHoldsHashesAndNeverKeys() {
        String configured = configured();

        assertThat(configured).doesNotContain(ACME_KEY);
        assertThat(configured).contains(ApiKeyStore.digest(ACME_KEY));

        ApiKeyStore store = ApiKeyStore.parse(configured);
        assertThat(store.size()).isEqualTo(2);

        ApiPrincipal principal = store.resolve(ACME_KEY).orElseThrow();
        assertThat(principal.scope()).isEqualTo(Scope.MERCHANT);
        assertThat(principal.merchantId()).isEqualTo("merch_acme");
    }

    @Test
    void anUnknownKeyResolvesToNothing() {
        assertThat(ApiKeyStore.parse(configured()).resolve("not-a-key")).isEqualTo(Optional.empty());
    }

    @Test
    void aPrincipalNeverCarriesEnoughToForgeItself() {
        // It is logged, so it has to be safe to log. Eight hex characters
        // identify the credential in an audit trail; the full digest would be
        // enough to write a configuration entry that authenticates as it.
        ApiPrincipal principal = ApiKeyStore.parse(configured()).resolve(ACME_KEY).orElseThrow();

        assertThat(principal.toString()).doesNotContain(ACME_KEY);
        assertThat(principal.toString()).doesNotContain(ApiKeyStore.digest(ACME_KEY));
        assertThat(principal.keyId()).hasSize(8);
    }

    @Test
    void anOperatorMayAddressAnyTenantAndAMerchantMayNot() {
        ApiKeyStore store = ApiKeyStore.parse(configured());

        assertThat(store.resolve(OPERATOR_KEY).orElseThrow().mayAddress("anything")).isTrue();
        assertThat(store.resolve(ACME_KEY).orElseThrow().mayAddress("merch_acme")).isTrue();
        assertThat(store.resolve(ACME_KEY).orElseThrow().mayAddress("merch_other")).isFalse();
    }

    /**
     * No entry is skipped and none is guessed at.
     *
     * <p>A store that silently dropped a bad entry would deny a real caller with
     * no explanation. One that silently accepted it might match nothing, or
     * match more than its author intended.
     */
    @ParameterizedTest(name = "{1}")
    @CsvSource({
        "'merchant:merch_acme', too few fields",
        "'merchant:merch_acme:abc:def', too many fields",
        "'merchant:merch_acme:not-a-digest', not a sha-256",
        "'merchant::0000000000000000000000000000000000000000000000000000000000000000', empty merchant id",
        "'operator:merch_acme:0000000000000000000000000000000000000000000000000000000000000000', operator bound to one tenant",
        "'admin:merch_acme:0000000000000000000000000000000000000000000000000000000000000000', unknown scope",
        "'merchant:a:1111111111111111111111111111111111111111111111111111111111111111,merchant:b:1111111111111111111111111111111111111111111111111111111111111111', duplicate digest",
    })
    void malformedConfigurationIsRefused(String configured, String because) {
        assertThatThrownBy(() -> ApiKeyStore.parse(configured))
                .as(because)
                .isInstanceOf(ApiKeyConfigurationException.class);
    }

    @Test
    void anEmptyConfigurationParsesToAnEmptyStoreRatherThanFailing() {
        // Parsing empty is legal; *starting* with an empty store while
        // authentication is required is not. That check lives in
        // ApiAuthProperties so the two failures stay distinguishable.
        assertThat(ApiKeyStore.parse("").size()).isZero();
        assertThat(ApiKeyStore.parse(null).size()).isZero();
    }

    @Test
    void digestsAreStableAndDistinct() {
        assertThat(ApiKeyStore.digest(ACME_KEY)).hasSize(64);
        assertThat(ApiKeyStore.digest(ACME_KEY)).isEqualTo(ApiKeyStore.digest(ACME_KEY));
        assertThat(ApiKeyStore.digest(ACME_KEY)).isNotEqualTo(ApiKeyStore.digest(ACME_KEY + " "));
    }

    @Test
    void anEmptyStoreWhileAuthenticationIsRequiredRefusesToStart() {
        ApiAuthProperties properties = new ApiAuthProperties();
        properties.setRequired(true);
        properties.setApiKeys("");

        assertThatThrownBy(properties::verify)
                .isInstanceOf(ApiKeyConfigurationException.class)
                .hasMessageContaining("would serve any caller");
    }

    @Test
    void runningOpenTakesAnExplicitDecision() {
        ApiAuthProperties properties = new ApiAuthProperties();
        properties.setRequired(false);
        properties.setApiKeys("");

        properties.verify();

        assertThat(properties.store().size()).isZero();
    }
}
