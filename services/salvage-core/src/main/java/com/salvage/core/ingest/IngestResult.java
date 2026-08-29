package com.salvage.core.ingest;

import java.util.UUID;

/**
 * Outcome of ingesting one failure event.
 *
 * @param paymentAttemptId the attempt the event was recorded against
 * @param duplicate true when this event had already been ingested, so no new
 *     row was written. Callers use this to distinguish "we did nothing because
 *     it was already done" from "we did nothing because something failed" --
 *     a distinction the bounds gate and the evaluation harness both depend on
 *     later, and one that is easy to lose if the return type is void.
 */
public record IngestResult(UUID paymentAttemptId, boolean duplicate) {

    public static IngestResult ingested(UUID paymentAttemptId) {
        return new IngestResult(paymentAttemptId, false);
    }

    public static IngestResult duplicate(UUID paymentAttemptId) {
        return new IngestResult(paymentAttemptId, true);
    }
}
