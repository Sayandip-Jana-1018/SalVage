import { z } from "zod";

export function registerPrompts(server: any) {
  server.prompt(
    "incident_autopsy",
    "Conduct a structured causal autopsy on a payment rail degradation or failed recovery",
    {
      rail_id: z.string().describe("The rail identifier that experienced degradation"),
      merchant_id: z.string().optional().describe("Optional merchant identifier"),
    },
    (args: { rail_id: string; merchant_id?: string }) => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please conduct a comprehensive incident autopsy for payment rail '${args.rail_id}'.
Use the available Salvage MCP tools:
1. Call 'get_rail_health' with rail_id='${args.rail_id}' to inspect 1m, 5m, and 15m error trends.
2. Call 'list_open_incidents' to check if cross-tenant corroboration exists.
${args.merchant_id ? `3. Call 'get_recovery_stats' for merchant '${args.merchant_id}' to measure economic blast radius.` : ""}
4. Synthesize:
   - Root Cause Diagnosis (Transient network vs Systemic issuer outage vs NPCI switch failure)
   - Salvage Policy Actions Taken (Immediate retry, scheduled retry, rail rerouting)
   - Safety Bounds Refusals (Quiet hours, attempt caps)
   - Total Rupee Value Protected / Recovered
   - Operational Recommendations for the on-call engineer.`,
            },
          },
        ],
      };
    }
  );
}
