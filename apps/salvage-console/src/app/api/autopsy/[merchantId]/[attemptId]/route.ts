import { NotFound, brain, core } from "@/lib/backend";
import { serve } from "@/lib/route-helpers";
import type {
  AttemptView,
  AutopsyView,
  DiagnosisView,
  LedgerEntryView,
  PolicyDecisionView,
} from "@/types";

export const dynamic = "force-dynamic";

/**
 * Resolve a call that is allowed to legitimately have no answer.
 *
 * A 404 from the diagnosis or policy engine means this attempt has no
 * diagnosis or no decision, which is a fact worth displaying. Any other
 * failure is rethrown, so the page reports the outage instead of drawing a
 * panel that reads "no decision" when the decision service is simply down.
 */
async function optional<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotFound) return null;
    throw error;
  }
}

/** GET /api/autopsy/{merchantId}/{attemptId} */
export async function GET(
  _request: Request,
  context: { params: Promise<{ merchantId: string; attemptId: string }> },
) {
  const { merchantId, attemptId } = await context.params;
  const m = encodeURIComponent(merchantId);
  const a = encodeURIComponent(attemptId);

  return serve<AutopsyView>(async () => {
    // Fetched first and not optional: with no attempt there is nothing to
    // diagnose, decide, or audit, and a 404 here is the honest answer.
    const attempt = await brain.get<AttemptView>(`/v1/attempts/${m}/${a}`);

    const [diagnosis, decision, ledgerEntries] = await Promise.all([
      optional(() =>
        brain.post<DiagnosisView>("/v1/diagnose", {
          merchant_id: merchantId,
          payment_attempt_id: attemptId,
        }),
      ),
      optional(() =>
        brain.post<PolicyDecisionView>("/v1/decide", {
          merchant_id: merchantId,
          payment_attempt_id: attemptId,
        }),
      ),
      core.get<LedgerEntryView[]>(`/api/v1/ledger/merchants/${m}/entries?limit=50`),
    ]);

    return {
      attempt,
      diagnosis,
      decision,
      // Only entries that actually mention this attempt. Showing the
      // merchant's whole recent ledger on an attempt page would imply those
      // entries relate to it.
      ledger_entries: ledgerEntries.filter((entry) => entry.payload.includes(attemptId)),
    };
  });
}
