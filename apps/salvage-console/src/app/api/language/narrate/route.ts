import { brainPostReadingRefusals } from "@/lib/backend";
import { serve } from "@/lib/route-helpers";
import type { Narration } from "@/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/language/narrate
 *
 * The browser sends a merchant id and an attempt id, and nothing else.
 * salvage-brain fetches the facts itself from its own read path — a narration
 * endpoint that narrated whatever JSON it was handed would produce
 * official-looking prose about events that never happened.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => ({}));
  return serve<Narration>(() =>
    brainPostReadingRefusals<Narration>("/v1/language/narrate", body),
  );
}
