import { brainPostReadingRefusals } from "@/lib/backend";
import { serve } from "@/lib/route-helpers";
import type { NudgeCopy } from "@/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/language/nudge
 *
 * Generates customer copy. Generating is not sending: nothing in salvage-brain
 * has an outbound channel to a customer, and delivery belongs to salvage-core
 * under the bounds engine.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => ({}));
  return serve<NudgeCopy>(() =>
    brainPostReadingRefusals<NudgeCopy>("/v1/language/nudge-copy", body),
  );
}
