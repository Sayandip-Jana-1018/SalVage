package com.salvage.core.api.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * The configured API keys, indexed by digest.
 *
 * <p><strong>Keys are never stored.</strong> Configuration carries the SHA-256
 * of each key, so a leak of the configuration -- an environment dump, a
 * misconfigured log, a container inspect -- does not leak a usable credential.
 * The plaintext exists once, in the output of
 * {@code scripts/generate_api_key.sh}, and whoever runs it is responsible for
 * handing it over.
 *
 * <p>The format is shared with salvage-brain, deliberately, so that one key
 * works against both services and an operator provisioning a merchant does it
 * once. Both parsers reject the same malformed entries for the same reasons.
 *
 * <p>Every malformed entry is a startup failure. There is no "skip the bad ones
 * and carry on": a store that silently dropped an entry would deny a real
 * caller with no explanation, and one that silently accepted a malformed entry
 * might match nothing, or match more than its author intended.
 */
public final class ApiKeyStore {

    private final Map<String, ApiPrincipal> byDigest;

    private ApiKeyStore(Map<String, ApiPrincipal> byDigest) {
        this.byDigest = byDigest;
    }

    public int size() {
        return byDigest.size();
    }

    /** SHA-256 of a key, lowercase hex. The only form ever stored. */
    public static String digest(String key) {
        try {
            MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(sha256.digest(key.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is required of every JVM. If it is absent, nothing about
            // this process is trustworthy and failing is the only honest move.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /**
     * Parse {@code scope:merchantId:sha256} entries, separated by commas or newlines.
     *
     * @throws ApiKeyConfigurationException on any entry that is not exactly that
     */
    public static ApiKeyStore parse(String configured) {
        Map<String, ApiPrincipal> records = new LinkedHashMap<>();
        if (configured == null || configured.isBlank()) {
            return new ApiKeyStore(records);
        }

        String[] entries = configured.replace('\n', ',').split(",");
        for (int index = 0; index < entries.length; index++) {
            String entry = entries[index].trim();
            if (entry.isEmpty()) {
                continue;
            }

            String[] fields = entry.split(":");
            if (fields.length != 3) {
                throw new ApiKeyConfigurationException(
                        "key entry " + index + " is not scope:merchantId:sha256 (got "
                                + fields.length + " fields)");
            }

            Scope scope;
            try {
                scope = Scope.valueOf(fields[0].trim().toUpperCase(java.util.Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw new ApiKeyConfigurationException(
                        "key entry " + index + " has scope '" + fields[0].trim()
                                + "'; expected merchant or operator");
            }

            String merchantId = fields[1].trim();
            String keyHash = fields[2].trim().toLowerCase(java.util.Locale.ROOT);

            if (!isSha256Hex(keyHash)) {
                throw new ApiKeyConfigurationException(
                        "key entry " + index + " does not carry a SHA-256 hex digest. "
                                + "Configuration holds hashes, never keys -- run "
                                + "scripts/generate_api_key.sh.");
            }
            if (scope == Scope.MERCHANT && merchantId.isEmpty()) {
                throw new ApiKeyConfigurationException(
                        "key entry " + index + " has scope merchant but no merchantId to bind to");
            }
            if (scope == Scope.OPERATOR && !merchantId.isEmpty() && !"*".equals(merchantId)) {
                throw new ApiKeyConfigurationException(
                        "key entry " + index + " has scope operator and a merchantId ('"
                                + merchantId + "'). An operator key addresses every tenant; "
                                + "binding it to one reads as a restriction it does not apply.");
            }
            if (records.containsKey(keyHash)) {
                throw new ApiKeyConfigurationException(
                        "key entry " + index + " repeats a digest already configured. Two entries "
                                + "for one key means one of them is not doing what its author thinks.");
            }

            records.put(
                    keyHash,
                    new ApiPrincipal(
                            scope,
                            scope == Scope.MERCHANT ? merchantId : null,
                            keyHash.substring(0, 8)));
        }
        return new ApiKeyStore(records);
    }

    private static boolean isSha256Hex(String candidate) {
        if (candidate.length() != 64) {
            return false;
        }
        for (int i = 0; i < candidate.length(); i++) {
            char c = candidate.charAt(i);
            boolean hex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
            if (!hex) {
                return false;
            }
        }
        return true;
    }

    /**
     * Resolve a presented key.
     *
     * <p>Lookup is by digest rather than by scanning and comparing, so the cost
     * does not depend on how many keys are configured, and no comparison is ever
     * made against a stored secret -- there is no stored secret to compare
     * against. {@link MessageDigest#isEqual} then confirms the hit in constant
     * time, which costs nothing and removes any argument about the map's
     * internal comparison.
     */
    public Optional<ApiPrincipal> resolve(String presentedKey) {
        String candidate = digest(presentedKey);
        ApiPrincipal principal = byDigest.get(candidate);
        if (principal == null) {
            return Optional.empty();
        }
        boolean equal =
                MessageDigest.isEqual(
                        candidate.getBytes(StandardCharsets.UTF_8),
                        digest(presentedKey).getBytes(StandardCharsets.UTF_8));
        return equal ? Optional.of(principal) : Optional.empty();
    }

    /** Raised at startup. Never at request time: by then the store is already built. */
    public static class ApiKeyConfigurationException extends RuntimeException {
        public ApiKeyConfigurationException(String message) {
            super(message);
        }
    }
}
