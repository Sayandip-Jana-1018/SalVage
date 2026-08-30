import { z } from "zod";
import { BrainClient } from "../clients/brainClient.js";

export const getRailHealthSchema = z.object({
  rail_id: z
    .string()
    .optional()
    .describe(
      "Optional rail identifier to inspect, in issuer|method|provider form. Omit for the whole matrix.",
    ),
});

export type GetRailHealthArgs = z.infer<typeof getRailHealthSchema>;

/**
 * Serve the live rail health matrix from salvage-brain.
 *
 * Reports exactly the fields the sensing service publishes -- state,
 * five-minute success rate, failure velocity, evaluation time -- and no
 * others. The previous version formatted `error_rate_1m`, `p95_latency_ms`,
 * `observed_attempts` and `healthy_alternative_rails`, none of which the
 * service returns; they came out as `undefined` or, when the service was
 * unreachable, as invented values attached to real bank names.
 */
export async function handleGetRailHealth(args: GetRailHealthArgs, brainClient: BrainClient) {
  const matrix = await brainClient.getRailHealth();

  const view = (rail: (typeof matrix.rails)[number]) => ({
    rail_id: rail.rail_id,
    state: rail.state,
    success_rate_5m: `${(rail.success_rate_5m * 100).toFixed(1)}%`,
    failure_velocity_5m: rail.failure_velocity_5m,
    last_evaluated_at: rail.last_evaluated_at,
  });

  if (args.rail_id) {
    const specific = matrix.rails.find((rail) => rail.rail_id === args.rail_id);
    if (!specific) {
      const known = matrix.rails.map((rail) => rail.rail_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                error: "rail_not_observed",
                requested_rail_id: args.rail_id,
                // An empty matrix means the sensing tracker has seen no
                // traffic, which is a different situation from the rail being
                // unknown. Saying so avoids implying the rail does not exist.
                detail:
                  known.length === 0
                    ? "The sensing matrix is empty: no attempts have been observed yet."
                    : "That rail is not in the active sensing matrix.",
                observed_rails: known,
                timestamp: matrix.timestamp,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ ...view(specific), timestamp: matrix.timestamp }, null, 2),
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
            timestamp: matrix.timestamp,
            observed_rail_count: matrix.rails.length,
            rails: matrix.rails.map(view),
          },
          null,
          2,
        ),
      },
    ],
  };
}
