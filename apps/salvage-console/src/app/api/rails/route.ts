import { brain } from "@/lib/backend";
import { serve } from "@/lib/route-helpers";
import type { RailHealthMatrix } from "@/types";

// Live operator data. Never prerendered or cached.
export const dynamic = "force-dynamic";

/** GET /api/rails -> salvage-brain GET /v1/sensing/rails */
export async function GET() {
  return serve<RailHealthMatrix>(() => brain.get<RailHealthMatrix>("/v1/sensing/rails"));
}
