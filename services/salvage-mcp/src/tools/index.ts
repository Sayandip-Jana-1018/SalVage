import { BrainClient } from "../clients/brainClient.js";
import { CoreClient } from "../clients/coreClient.js";
import {
  explainDecisionSchema,
  handleExplainDecision,
} from "./explainDecision.js";
import {
  getRailHealthSchema,
  handleGetRailHealth,
} from "./getRailHealth.js";
import {
  getRecoveryStatsSchema,
  handleGetRecoveryStats,
} from "./getRecoveryStats.js";
import {
  handleListOpenIncidents,
  listOpenIncidentsSchema,
} from "./listOpenIncidents.js";
import {
  handleSimulatePolicyChange,
  simulatePolicyChangeSchema,
} from "./simulatePolicyChange.js";

export function registerTools(server: any, brainClient: BrainClient, coreClient: CoreClient) {
  // 1. get_rail_health
  server.tool(
    "get_rail_health",
    "Get real-time health metrics, error rates (1m, 5m, 15m), and healthy alternatives for payment rails",
    getRailHealthSchema.shape,
    async (args: any) => handleGetRailHealth(args, brainClient)
  );

  // 2. explain_decision
  server.tool(
    "explain_decision",
    "Get a full causal explanation of a recovery decision (diagnosis, sensing, utility calculus, bounds, and ledger)",
    explainDecisionSchema.shape,
    async (args: any) => handleExplainDecision(args, brainClient, coreClient)
  );

  // 3. get_recovery_stats
  server.tool(
    "get_recovery_stats",
    "Get aggregate payment failure recovery statistics, recovered rupees, and bounds refusals for a merchant",
    getRecoveryStatsSchema.shape,
    async (args: any) => handleGetRecoveryStats(args, coreClient)
  );

  // 4. list_open_incidents
  server.tool(
    "list_open_incidents",
    "List currently active rail degradations and cross-tenant failure spikes requiring attention",
    listOpenIncidentsSchema.shape,
    async (args: any) => handleListOpenIncidents(args, brainClient)
  );

  // 5. simulate_policy_change
  server.tool(
    "simulate_policy_change",
    "Run counterfactual off-policy simulations for proposed policy changes with Doubly Robust confidence intervals",
    simulatePolicyChangeSchema.shape,
    async (args: any) => handleSimulatePolicyChange(args)
  );
}
