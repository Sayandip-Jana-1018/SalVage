import { z } from "zod";
import { BrainClient } from "../clients/brainClient.js";

export const listOpenIncidentsSchema = z.object({
  min_severity: z.enum(["DEGRADED", "DOWN"]).default("DEGRADED").describe("Minimum incident severity to filter on"),
});

export type ListOpenIncidentsArgs = z.infer<typeof listOpenIncidentsSchema>;

export async function handleListOpenIncidents(args: ListOpenIncidentsArgs, brainClient: BrainClient) {
  const { rails, sensing_timestamp } = await brainClient.getRailHealth();

  const activeIncidents = Object.values(rails)
    .filter((r) => {
      if (args.min_severity === "DOWN") {
        return r.state === "DOWN";
      }
      return r.state === "DEGRADED" || r.state === "DOWN";
    })
    .map((r) => ({
      incident_id: `inc_${r.rail_id.replace(/\|/g, "_").toLowerCase()}`,
      affected_rail: r.rail_id,
      severity: r.state,
      error_rate_1m: `${(r.error_rate_1m * 100).toFixed(1)}%`,
      error_rate_5m: `${(r.error_rate_5m * 100).toFixed(1)}%`,
      p95_latency_ms: r.p95_latency_ms,
      active_reroutes_to: r.healthy_alternative_rails,
      recommended_action: r.state === "DOWN" ? "SWITCH_RAIL" : "RETRY_SCHEDULED",
    }));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            open_incident_count: activeIncidents.length,
            sensing_timestamp,
            incidents: activeIncidents,
          },
          null,
          2
        ),
      },
    ],
  };
}
