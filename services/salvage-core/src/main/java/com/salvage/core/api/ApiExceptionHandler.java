package com.salvage.core.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/**
 * Turns bad input into 400 and everything else into 500, without leaking detail.
 *
 * <p>The body carries the exception's <em>type</em> and, for
 * {@link IllegalArgumentException} only, its message. That asymmetry is
 * deliberate and matches the rule already applied in
 * {@code InfrastructureHealthController}: a validation message is written by
 * us and safe to return, whereas an arbitrary exception's message is written
 * by a driver and routinely embeds connection strings and credentials. So the
 * message of an unexpected failure goes to the log and nowhere else.
 *
 * <p><strong>{@link ResponseStatusException} passes through.</strong> Without
 * the handler below, the catch-all turned every deliberate status into a 500 --
 * including the 404 a tenant-scoped route raises when a merchant key reaches
 * for another merchant. Access control was working and reporting itself as a
 * server fault, which is the kind of thing that wakes somebody at 3am to
 * investigate a database that is fine.
 */
@RestControllerAdvice(assignableTypes = {LedgerController.class, TelemetryController.class})
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> badRequest(IllegalArgumentException exception) {
        return ResponseEntity.badRequest()
                .body(new ApiError("invalid_request", exception.getMessage()));
    }

    /**
     * A status somebody chose on purpose, served as chosen.
     *
     * <p>The reason is returned because these are written here, not by a
     * driver: "No such merchant" and nothing else. In particular a tenant
     * refusal must be indistinguishable from a merchant that does not exist, so
     * the reason deliberately does not say which of the two happened.
     */
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ApiError> deliberate(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode())
                .body(new ApiError(exception.getReason(), null));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> unexpected(Exception exception) {
        log.error("unhandled error serving an api request", exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError(exception.getClass().getSimpleName(), null));
    }

    public record ApiError(
            @JsonProperty("error") String error, @JsonProperty("detail") String detail) {}
}
