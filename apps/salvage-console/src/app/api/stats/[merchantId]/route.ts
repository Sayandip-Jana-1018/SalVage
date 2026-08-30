import { core } from "@/lib/backend";
import { serve } from "@/lib/route-helpers";
import type { MerchantStats } from "@/types";

export const dynamic = "force-dynamic";

/** GET /api/stats/{merchantId}?hours= -> salvage-core telemetry */
export async function GET(
  request: Request,
  context: { params: Promise<{ merchantId: string }> },
) {
  const { merchantId } = await context.params;
  const hours = new URL(request.url).searchParams.get("hours") ?? "24";
  return serve<MerchantStats>(() =>
    core.get<MerchantStats>(
      `/api/v1/telemetry/merchants/${encodeURIComponent(merchantId)}/stats?hours=${encodeURIComponent(hours)}`,
    ),
  );
}
