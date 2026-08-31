import { brain } from "@/lib/backend";
import { serve } from "@/lib/route-helpers";
import type { AttemptPage } from "@/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/attempts/{merchantId}?limit=
 *
 * The listing the autopsy page needed and did not have. Until salvage-brain
 * grew `GET /v1/attempts/{merchant_id}`, the only way into an autopsy was to
 * already know the attempt id, so the page asked for one — the honest response
 * to a missing endpoint, and a poor one to work with.
 *
 * The limit is passed through rather than clamped here. salvage-brain rejects
 * an out-of-range limit with 422, and re-implementing its bound in a proxy is
 * how the two drift apart.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ merchantId: string }> },
) {
  const { merchantId } = await context.params;
  const limit = new URL(request.url).searchParams.get("limit") ?? "50";

  return serve<AttemptPage>(() =>
    brain.get<AttemptPage>(
      `/v1/attempts/${encodeURIComponent(merchantId)}?limit=${encodeURIComponent(limit)}`,
    ),
  );
}
