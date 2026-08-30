import { core } from "@/lib/backend";
import { serve } from "@/lib/route-helpers";
import type { ChainVerification, LedgerEntryView } from "@/types";

export const dynamic = "force-dynamic";

interface LedgerPayload {
  verification: ChainVerification;
  entries: LedgerEntryView[];
}

/**
 * GET /api/ledger/{merchantId}?limit=
 *
 * Returns the recent entries together with the chain verdict. They are fetched
 * as a pair because showing entries without saying whether the chain they
 * belong to still verifies is the half of the story that flatters the system.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ merchantId: string }> },
) {
  const { merchantId } = await context.params;
  const id = encodeURIComponent(merchantId);
  const limit = new URL(request.url).searchParams.get("limit") ?? "20";

  return serve<LedgerPayload>(async () => {
    const [verification, entries] = await Promise.all([
      core.get<ChainVerification>(`/api/v1/ledger/merchants/${id}/verify`),
      core.get<LedgerEntryView[]>(
        `/api/v1/ledger/merchants/${id}/entries?limit=${encodeURIComponent(limit)}`,
      ),
    ]);
    return { verification, entries };
  });
}
