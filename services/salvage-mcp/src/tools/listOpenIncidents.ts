import { z } from "zod";
import { BrainClient } from "../clients/brainClient.js";

export const listOpenIncidentsSchema = z.object({
  min_severity: z
    .enum(["DEGRADED", "DOWN"])
    .default("DEGRADED")
    .describe("Minimum severity to report. DEGRADED includes DOWN."),
});

export type ListOpenIncidentsArgs = z.infer<typeof listOpenIncidentsSchema>;

/**
 * Rails currently in a degraded or down state, from live sensing.
 *
 * Derived entirely from the sensing matrix. It deliberately does not suggest a
 * recovery action per incident: choosing an action is the policy engine's job,
 * it depends on the specific failure and payer rather than on the rail alone,
 * and an action named here would be an unbounded recommendation reaching an
 * operator without having passed the bounds engine. `explain_decision` answers
 * that question for a real attempt, through the real policy path.
 */
export async function handleListOpenIncidents(
  args: ListOpenIncidentsArgs,
  brainClient: BrainClient,
) {
  const matrix = await brainClient.getRailHealth();

  const incidents = matrix.rails
    .filter((rail) =>
      args.min_severity === "DOWN"
        ? rail.state === "DOWN"
        : rail.state === "DEGRADED" || rail.state === "DOWN",
    )
    .map((rail) => ({
      affected_rail: rail.rail_id,
      severity: rail.state,
      success_rate_5m: `${(rail.success_rate_5m * 100).toFixed(1)}%`,
      failure_velocity_5m: rail.failure_velocity_5m,
      last_evaluated_at: rail.last_evaluated_at,
    }));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            timestamp: matrix.timestamp,
            min_severity: args.min_severity,
            observed_rail_count: matrix.rails.length,
            open_incident_count: incidents.length,
            incidents,
          },
          null,
          2,
        ),
      },
    ],
  };
}
