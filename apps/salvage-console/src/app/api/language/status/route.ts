import { brain } from "@/lib/backend";
import { serve } from "@/lib/route-helpers";
import type { LanguageStatus } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/language/status
 *
 * Answers even when the layer is off. "Switched off" and "broken" are different
 * facts and the page renders them differently; an endpoint that failed for both
 * would make them indistinguishable, which is the same mistake as an empty rail
 * matrix standing in for a lost backend.
 */
export async function GET() {
  return serve<LanguageStatus>(() => brain.get<LanguageStatus>("/v1/language/status"));
}
