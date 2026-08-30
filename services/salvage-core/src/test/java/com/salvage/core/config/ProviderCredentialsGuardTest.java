package com.salvage.core.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * The guard that ADR-0003 and .env.example described for months before it
 * existed. These tests are what make the documentation true.
 *
 * <p>Deliberately a plain unit test: the rule is a string prefix check, and
 * standing up a Spring context to assert it would make the suite slower
 * without testing anything the guard actually does.
 */
class ProviderCredentialsGuardTest {

    @Test
    void a_live_key_prevents_startup() {
        assertThatThrownBy(() -> ProviderCredentialsGuard.assertNotLive("rzp_live_AbCdEf123456"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Refusing to start");
    }

    @Test
    void a_test_key_is_accepted() {
        assertThatCode(() -> ProviderCredentialsGuard.assertNotLive("rzp_test_AbCdEf123456"))
                .doesNotThrowAnyException();
    }

    @Test
    void an_absent_key_is_accepted() {
        // The simulated provider needs no credentials, and the default demo
        // path must not require anyone to obtain one.
        assertThatCode(() -> ProviderCredentialsGuard.assertNotLive("")).doesNotThrowAnyException();
        assertThatCode(() -> ProviderCredentialsGuard.assertNotLive(null))
                .doesNotThrowAnyException();
    }

    @Test
    void the_failure_message_never_contains_the_key() {
        // A startup failure is the most widely-read line a service emits: CI
        // output, container logs, alerting. Echoing the credential there would
        // turn a safety control into a disclosure.
        String secret = "rzp_live_SUPERSECRETVALUE99";
        assertThatThrownBy(() -> ProviderCredentialsGuard.assertNotLive(secret))
                .satisfies(thrown -> assertThat(thrown.getMessage()).doesNotContain(secret));
    }

    @Test
    void a_key_that_merely_mentions_live_is_not_rejected() {
        // The rule is a prefix, not a substring. A test key whose random body
        // happens to contain the characters "rzp_live_" must still boot.
        assertThatCode(() -> ProviderCredentialsGuard.assertNotLive("rzp_test_xrzp_live_y"))
                .doesNotThrowAnyException();
    }
}
