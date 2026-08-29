import { z } from "zod";
import { BrainClient } from "../clients/brainClient.js";

export const getRailHealthSchema = z.object({
  rail_id: z.string().optional().describe("Optional specific rail identifier (e.g. 'HDFC|UPI|RAZORPAY') to inspect"),
});

export type GetRailHealthArgs = z.infer<typeof getRailHealthSchema>;

export async function handleGetRailHealth(args: GetRailHealthArgs, brainClient: BrainClient) {
  const data = await brainClient.getRailHealth();
  const { rails, sensing_timestamp } = data;

  if (args.rail_id) {
    const specific = rails[args.rail_id];
    if (!specific) {
      return {
        content: [
          {
            type: "text",
            text: `Rail '${args.rail_id}' not found in active sensing matrix. Available rails: ${Object.keys(rails).join(", ")}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              rail_id: specific.rail_id,
              state: specific.state,
              error_rate_1m: `${(specific.error_rate_1m * 100).toFixed(1)}%`,
              error_rate_5m: `${(specific.error_rate_5m * 100).toFixed(1)}%`,
              error_rate_15m: `${(specific.error_rate_15m * 100).toFixed(1)}%`,
              p95_latency_ms: specific.p95_latency_ms,
              observed_attempts: specific.observed_attempts,
              healthy_alternative_rails: specific.healthy_alternative_rails,
              sensing_timestamp,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const summary = Object.values(rails).map((r) => ({
    rail_id: r.rail_id,
    state: r.state,
    error_rate_5m: `${(r.error_rate_5m * 100).toFixed(1)}%`,
    p95_latency_ms: r.p95_latency_ms,
    healthy_alternatives: r.healthy_alternative_rails,
  }));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ summary, sensing_timestamp }, null, 2),
      },
    ],
  };
}
