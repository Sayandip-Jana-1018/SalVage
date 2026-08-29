import { z } from "zod";
import { CoreClient } from "../clients/coreClient.js";

export const getRecoveryStatsSchema = z.object({
  merchant_id: z.string().describe("Merchant identifier to query statistics for"),
  time_window_hours: z.number().int().positive().default(24).describe("Lookback window in hours (default: 24)"),
});

export type GetRecoveryStatsArgs = z.infer<typeof getRecoveryStatsSchema>;

export async function handleGetRecoveryStats(args: GetRecoveryStatsArgs, coreClient: CoreClient) {
  const stats = await coreClient.getMerchantStats(args.merchant_id, args.time_window_hours);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            merchant_id: stats.merchant_id,
            time_window_hours: stats.time_window_hours,
            total_failures_observed: stats.total_failures_observed,
            total_recoveries_executed: stats.total_recoveries_executed,
            recovery_rate: `${stats.recovery_rate_pct.toFixed(1)}%`,
            gross_recovered_rupees: `₹${stats.gross_recovered_inr.toLocaleString("en-IN")}`,
            bounds_refusal_count: stats.bounds_refusal_count,
            taxonomy_breakdown: stats.taxonomy_breakdown,
            action_breakdown: stats.action_breakdown,
          },
          null,
          2
        ),
      },
    ],
  };
}
