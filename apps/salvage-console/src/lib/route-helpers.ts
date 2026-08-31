import { NextResponse } from "next/server";
import { BackendUnavailable, NotFound, Refused } from "@/lib/backend";
import type { ApiResult } from "@/types";

/**
 * Run a backend call and shape the outcome into {@link ApiResult}.
 *
 * Three outcomes, kept distinct all the way to the browser:
 *
 *   200 { ok: true }   the backend answered
 *   404 { ok: false }  the record genuinely does not exist
 *   502 { ok: false }  the backend could not be reached or failed
 *
 * The last two are separated on purpose. "This payment has no decision" and
 * "the decision service is down" look identical in a UI that collapses them,
 * and they call for opposite responses from whoever is looking at the screen.
 */
export async function serve<T>(run: () => Promise<T>): Promise<NextResponse<ApiResult<T>>> {
  try {
    return NextResponse.json({ ok: true, data: await run() } as ApiResult<T>);
  } catch (error) {
    if (error instanceof NotFound) {
      return NextResponse.json({ ok: false, error: error.message } as ApiResult<T>, {
        status: 404,
      });
    }
    if (error instanceof Refused) {
      // A refusal the backend authored for a human to read. Passed through with
      // its own status so the UI can tell "the layer is switched off" (503)
      // apart from "the model answered with something that failed validation"
      // (502) apart from "this code is already mapped" (409).
      return NextResponse.json({ ok: false, error: error.message } as ApiResult<T>, {
        status: error.status,
      });
    }
    if (error instanceof BackendUnavailable) {
      return NextResponse.json(
        { ok: false, error: error.message, service: error.service } as ApiResult<T>,
        { status: 502 },
      );
    }
    // Never echo an unknown error's message to the browser; it may carry
    // internals. The name alone is enough to tell the operator something
    // unexpected happened, and the server log has the rest.
    console.error("console api route failed", error);
    return NextResponse.json(
      { ok: false, error: "The console hit an unexpected error." } as ApiResult<T>,
      { status: 500 },
    );
  }
}
