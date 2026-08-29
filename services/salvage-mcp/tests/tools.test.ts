import { describe, expect, it } from "vitest";
import { BrainClient } from "../src/clients/brainClient.js";
import { CoreClient } from "../src/clients/coreClient.js";
import { handleExplainDecision } from "../src/tools/explainDecision.js";
import { handleGetRailHealth } from "../src/tools/getRailHealth.js";
import { handleGetRecoveryStats } from "../src/tools/getRecoveryStats.js";
import { handleListOpenIncidents } from "../src/tools/listOpenIncidents.js";
import { handleSimulatePolicyChange } from "../src/tools/simulatePolicyChange.js";

describe("Salvage MCP Tools", () => {
  const brainClient = new BrainClient();
  const coreClient = new CoreClient();

  it("get_rail_health returns health matrix for all rails", async () => {
    const res = await handleGetRailHealth({}, brainClient);
    expect(res.content).toBeDefined();
    expect(res.content[0].type).toBe("text");
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.summary).toBeInstanceOf(Array);
    expect(parsed.summary.length).toBeGreaterThan(0);
    expect(parsed.sensing_timestamp).toBeDefined();
  });

  it("get_rail_health filters for specific rail", async () => {
    const res = await handleGetRailHealth({ rail_id: "HDFC|UPI|RAZORPAY" }, brainClient);
    expect(res.content[0].type).toBe("text");
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.rail_id).toBe("HDFC|UPI|RAZORPAY");
    expect(parsed.state).toBe("HEALTHY");
  });

  it("explain_decision formats full causal narrative", async () => {
    const res = await handleExplainDecision(
      { merchant_id: "m_test_101", payment_attempt_id: "att_test_202" },
      brainClient,
      coreClient
    );
    expect(res.content[0].text).toContain("Causal Decision Explanation");
    expect(res.content[0].text).toContain("Taxonomy Classification");
    expect(res.content[0].text).toContain("Bounds Engine Verdict");
  });

  it("get_recovery_stats returns aggregate metrics", async () => {
    const res = await handleGetRecoveryStats(
      { merchant_id: "m_test_101", time_window_hours: 24 },
      coreClient
    );
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.merchant_id).toBe("m_test_101");
    expect(parsed.recovery_rate).toBeDefined();
    expect(parsed.gross_recovered_rupees).toBeDefined();
  });

  it("list_open_incidents returns active rail alerts", async () => {
    const res = await handleListOpenIncidents({ min_severity: "DEGRADED" }, brainClient);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.incidents).toBeInstanceOf(Array);
  });

  it("simulate_policy_change returns counterfactual DR estimates and ESS", async () => {
    const res = await handleSimulatePolicyChange({
      proposed_policy_name: "Aggressive Immediate Retry",
      max_attempts: 3,
      quiet_hours_enabled: true,
      scheduled_retry_delay_minutes: 60,
    });
    expect(res.content[0].text).toContain("Policy Simulation Report");
    expect(res.content[0].text).toContain("Doubly Robust Estimate");
    expect(res.content[0].text).toContain("Kish Effective Sample Size");
  });
});
