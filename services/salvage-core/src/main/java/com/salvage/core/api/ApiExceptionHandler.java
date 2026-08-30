package com.salvage.core.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Turns bad input into 400 and everything else into 500, without leaking detail.
 *
 * <p>The body carries the exception's <em>type</em> and, for
 * {@link IllegalArgumentException} only, its message. That asymmetry is
 * deliberate and matches the rule already applied in
 * {@code InfrastructureHealthController}: a validation message is written by
 * us and safe to return, whereas an arbitrary exception's message is written
 * by a driver and routinely embeds connection strings and credentials. These
 * routes are unauthenticated, so the message of an unexpected failure goes to
 * the log and nowhere else.
 */
@RestControllerAdvice(assignableTypes = {LedgerController.class, TelemetryController.class})
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiError> badRequest(IllegalArgumentException exception) {
        return ResponseEntity.badRequest()
                .body(new ApiError("invalid_request", exception.getMessage()));
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
