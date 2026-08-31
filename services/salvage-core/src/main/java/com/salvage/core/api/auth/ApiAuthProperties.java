package com.salvage.core.api.auth;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Authentication configuration, and the refusal to start without it.
 *
 * <p>{@code required} defaults to true and a service with no keys configured
 * fails to start. That is the whole design: the failure this package exists to
 * prevent is a service coming up open because somebody forgot to set a
 * variable, and a process that exits is impossible to miss in a way that a log
 * line is not.
 *
 * <p>Running without authentication remains possible, because the quickstart
 * needs it, but it takes an explicit {@code SALVAGE_AUTH_REQUIRED=false} and
 * the process says loudly at startup what it is doing.
 */
@Component
@ConfigurationProperties(prefix = "salvage.auth")
public class ApiAuthProperties {

    private static final Logger log = LoggerFactory.getLogger(ApiAuthProperties.class);

    private boolean required = true;
    private String apiKeys = "";

    private ApiKeyStore store = ApiKeyStore.parse("");

    public boolean isRequired() {
        return required;
    }

    public void setRequired(boolean required) {
        this.required = required;
    }

    public String getApiKeys() {
        return apiKeys;
    }

    public void setApiKeys(String apiKeys) {
        this.apiKeys = apiKeys;
    }

    public ApiKeyStore store() {
        return store;
    }

    /**
     * Parse once, at startup, and fail the context if the result is unusable.
     *
     * <p>Parsing here rather than per request means a malformed entry is a
     * deployment that does not start, not a 500 the first time somebody calls.
     */
    @PostConstruct
    void verify() {
        store = ApiKeyStore.parse(apiKeys);

        if (!required) {
            log.warn(
                    "salvage.auth.required is false: every API endpoint on this service will "
                            + "answer any caller, for any tenant. Intended only for local "
                            + "development.");
            return;
        }
        if (store.size() == 0) {
            throw new ApiKeyStore.ApiKeyConfigurationException(
                    "salvage.auth.required is true and salvage.auth.api-keys is empty, so every "
                            + "endpoint would serve any caller. Generate a key with "
                            + "scripts/generate_api_key.sh, or set SALVAGE_AUTH_REQUIRED=false to "
                            + "run this service without authentication on purpose.");
        }
        log.info("API authentication enabled with {} configured key(s)", store.size());
    }
}
