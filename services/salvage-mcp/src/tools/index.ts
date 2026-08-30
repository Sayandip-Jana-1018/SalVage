import { BrainClient } from "../clients/brainClient.js";
import { CoreClient } from "../clients/coreClient.js";
import { BackendError } from "../clients/errors.js";
import { explainDecisionSchema, handleExplainDecision } from "./explainDecision.js";
import { getRailHealthSchema, handleGetRailHealth } from "./getRailHealth.js";
import { getRecoveryStatsSchema, handleGetRecoveryStats } from "./getRecoveryStats.js";
import { handleListOpenIncidents, listOpenIncidentsSchema } from "./listOpenIncidents.js";
import { handleVerifyLedger, verifyLedgerSchema } from "./verifyLedger.js";

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

/**
 * Report a backend failure as a tool error rather than letting it surface as
 * an unhandled exception or, worse, as a plausible answer.
 *
 * `isError` is what tells the MCP client that the call did not succeed. Every
 * tool here reads state and none writes, so a failure is always safe to
 * report and retry; what is not safe is answering anyway.
 */
function toolFailure(error: unknown): ToolResult {
  const message =
    error instanceof BackendError
      ? `${error.message}. No data is being reported for this call: the question could not be answered, which is not the same as the answer being empty.`
      : `Unexpected failure: ${error instanceof Error ? error.name : "unknown error"}`;
  return { content: [{ type: "text", text: message }], isError: true };
}

async function guarded(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (error) {
    return toolFailure(error);
  }
}

/**
 * Register the read-only tool surface.
 *
 * Every tool here reads. None of them decides, executes, schedules, or
 * commits anything, and neither backend exposes a route that would let them:
 * execution lives in salvage-core behind the bounds engine and is reachable
 * only from the ingest path. That is what makes "no LLM makes a money
 * decision" a property of the wiring rather than a promise.
 */
export function registerTools(server: any, brainClient: BrainClient, coreClient: CoreClient) {
  server.tool(
    "get_rail_health",
    "Live health of payment rails: state, five-minute success rate, and failure velocity, from the sensing matrix",
    getRailHealthSchema.shape,
    async (args: any) => guarded(() => handleGetRailHealth(args, brainClient)),
  );

  server.tool(
    "explain_decision",
    "Explain one payment attempt: what was ingested, how it was diagnosed, what the policy chose, and the ledger record",
    explainDecisionSchema.shape,
    async (args: any) => guarded(() => handleExplainDecision(args, brainClient, coreClient)),
  );

  server.tool(
    "get_recovery_stats",
    "Counted failures and decisions for a merchant over a window, with taxonomy and action breakdowns",
    getRecoveryStatsSchema.shape,
    async (args: any) => guarded(() => handleGetRecoveryStats(args, coreClient)),
  );

  server.tool(
    "list_open_incidents",
    "Rails currently degraded or down, from live sensing",
    listOpenIncidentsSchema.shape,
    async (args: any) => guarded(() => handleListOpenIncidents(args, brainClient)),
  );

  server.tool(
    "verify_ledger",
    "Recompute a merchant's ledger hash chain server-side and report whether it is intact or where it breaks",
    verifyLedgerSchema.shape,
    async (args: any) => guarded(() => handleVerifyLedger(args, coreClient)),
  );
}
