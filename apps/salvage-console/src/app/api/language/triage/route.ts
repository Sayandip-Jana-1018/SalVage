import { brainPostReadingRefusals } from "@/lib/backend";
import { serve } from "@/lib/route-helpers";
import type { TriageResponse } from "@/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/language/triage
 *
 * Asks for a proposed taxonomy mapping for a decline code the deterministic
 * mapper cannot resolve. The result is a proposal for human review and is never
 * applied — there is no endpoint anywhere in this repository that would apply
 * one.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => ({}));
  return serve<TriageResponse>(() =>
    brainPostReadingRefusals<TriageResponse>("/v1/language/triage", body),
  );
}
