import { z } from "zod";
import { CoreClient } from "../clients/coreClient.js";

export const getRecoveryStatsSchema = z.object({
  merchant_id: z.string().describe("Merchant identifier to query"),
  time_window_hours: z
    .number()
    .int()
    .min(1)
    .max(2160)
    .default(24)
    .describe("Lookback window in hours, 1 to 2160 (90 days)"),
});

export type GetRecoveryStatsArgs = z.infer<typeof getRecoveryStatsSchema>;

/**
 * Counted activity for a merchant, from salvage-core.
 *
 * Reports what was observed and decided. It does **not** report a recovery
 * rate or rupees recovered, because salvage-core cannot yet establish either:
 * confirming a recovery means observing a later success on the same order
 * inside the attribution window, and the execution path that would record
 * that is not connected to a payment provider. The previous version of this
 * tool reported both anyway, filled from a hardcoded fallback in the client,
 * and an operator asking a language model "how much did we recover?" was told
 * ₹181,000.
 *
 * `expected_net_value_paise_permitted` is the policy's own expected value
 * summed over permitted decisions. The field name and the note below both say
 * that it is a model expectation rather than money observed to have arrived.
 */
export async function handleGetRecoveryStats(
  args: GetRecoveryStatsArgs,
  coreClient: CoreClient,
) {
  const stats = await coreClient.getMerchantStats(args.merchant_id, args.time_window_hours);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            merchant_id: stats.merchant_id,
            window_hours: stats.window_hours,
            window_start: stats.window_start,
            failures_observed: stats.failures_observed,
            decisions_made: stats.decisions_made,
            decisions_permitted: stats.decisions_permitted,
            decisions_refused_by_bounds: stats.decisions_refused_by_bounds,
            expected_net_value_permitted_rupees: (
              stats.expected_net_value_paise_permitted / 100
            ).toFixed(2),
            taxonomy_breakdown: stats.taxonomy_breakdown,
            action_breakdown: stats.action_breakdown,
            notes: [
              "expected_net_value_permitted_rupees is the policy's expected value over permitted decisions. It is a model estimate, not money observed to have been recovered.",
              stats.truncated
                ? "The window contained more rows than the aggregation cap, so the breakdowns cover a prefix. Treat them as lower bounds."
                : "All rows in the window were aggregated.",
            ],
          },
          null,
          2,
        ),
      },
    ],
  };
}
