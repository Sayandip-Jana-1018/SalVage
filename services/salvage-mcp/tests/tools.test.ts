import { describe, expect, it } from "vitest";
import type { BrainClient } from "../src/clients/brainClient.js";
import type { CoreClient } from "../src/clients/coreClient.js";
import { BackendError } from "../src/clients/errors.js";
import { handleExplainDecision } from "../src/tools/explainDecision.js";
import { handleGetRailHealth } from "../src/tools/getRailHealth.js";
import { handleGetRecoveryStats } from "../src/tools/getRecoveryStats.js";
import { handleListOpenIncidents } from "../src/tools/listOpenIncidents.js";
import { handleVerifyLedger } from "../src/tools/verifyLedger.js";
import type {
  AttemptView,
  ChainVerification,
  DiagnosisResponse,
  LedgerEntryView,
  MerchantStats,
  PolicyDecisionResponse,
  RailHealthMatrix,
} from "../src/clients/types.js";

/**
 * Tools are tested against stubs shaped like the real responses.
 *
 * The stubs below are transcribed from the actual service models, not from
 * what this package once assumed they were. That distinction is the reason
 * these tests exist in this form: the previous suite ran every tool against a
 * live client pointed at nothing, and passed because the client fabricated
 * data. It therefore validated the fabrication and never once exercised the
 * real response shape -- which is why nobody noticed that `is_transient`,
 * `corroborated_by_network` and `recommended_action` are fields no service has
 * ever returned.
 *
 * Rail identifiers here are synthetic. Naming a real bank in a fixture and
 * attaching a failure state to it is an unsourced claim about that
 * institution, which docs/adr/0006-numbers-policy.md forbids anywhere in this
 * repository -- test data included, because test data gets copied.
 */

const RAIL_MATRIX: RailHealthMatrix = {
  timestamp: "2026-08-30T10:00:00Z",
  rails: [
    {
      rail_id: "issuer_alpha|upi|simulated",
      state: "HEALTHY",
      success_rate_5m: 0.981,
      failure_velocity_5m: 0.2,
      last_evaluated_at: "2026-08-30T10:00:00Z",
    },
    {
      rail_id: "issuer_gamma|upi|simulated",
      state: "DOWN",
      success_rate_5m: 0.031,
      failure_velocity_5m: 12.4,
      last_evaluated_at: "2026-08-30T10:00:00Z",
    },
    {
      rail_id: "issuer_beta|card|simulated",
      state: "DEGRADED",
      success_rate_5m: 0.642,
      failure_velocity_5m: 3.1,
      last_evaluated_at: "2026-08-30T10:00:00Z",
    },
  ],
};

const ATTEMPT: AttemptView = {
  merchant_id: "merchant_001",
  order_id: "ord_1",
  payment_attempt_id: "pay_1",
  amount_paise: 249900,
  currency: "INR",
  payment_method: "upi",
  provider: "simulated",
  issuer: "issuer_gamma",
  is_recurring: false,
  created_at: "2026-08-30T09:59:00Z",
  failures: [
    {
      event_id: "11111111-1111-1111-1111-111111111111",
      provider_error_code: "SIM_ISSUER_UNAVAILABLE",
      rail_id: "issuer_gamma|upi|simulated",
      event_timestamp: "2026-08-30T09:59:01Z",
      taxonomy_code: "ISSUER_OUTAGE",
    },
  ],
};

const DIAGNOSIS: DiagnosisResponse = {
  payment_attempt_id: "pay_1",
  taxonomy_code: "ISSUER_OUTAGE",
  confidence: 0.91,
  root_cause: "Issuer is not answering authorisation requests",
  rail_id: "issuer_gamma|upi|simulated",
  rail_state: "DOWN",
  explainability_tokens: ["RAIL_DOWN", "CORROBORATED"],
  suggested_action: "SWITCH_RAIL",
  diagnosed_at: "2026-08-30T10:00:00Z",
};

const DECISION: PolicyDecisionResponse = {
  payment_attempt_id: "pay_1",
  chosen_action: "SWITCH_RAIL",
  recovery_probability: 0.83,
  expected_net_value_paise: 198000,
  target_rail_id: "issuer_alpha|upi|simulated",
  scheduled_delay_seconds: null,
  nudge_channel: null,
  reasoning_tokens: ["RAIL_DOWN", "ALTERNATIVE_HEALTHY"],
  candidate_valuations: [
    {
      action: "SWITCH_RAIL",
      recovery_probability: 0.83,
      gross_expected_value_paise: 207417,
      estimated_cost_paise: 9417,
      net_expected_value_paise: 198000,
    },
    {
      action: "NO_ACTION",
      recovery_probability: 0.0,
      gross_expected_value_paise: 0,
      estimated_cost_paise: 0,
      net_expected_value_paise: 0,
    },
  ],
  decided_at: "2026-08-30T10:00:00Z",
};

const LEDGER: LedgerEntryView[] = [
  {
    entry_index: 42,
    merchant_id: "merchant_001",
    entity_type: "RECOVERY_SAGA",
    entity_id: "saga-1",
    event_type: "DECISION_PERMITTED",
    payload: '{"payment_attempt_id":"pay_1","action":"SWITCH_RAIL"}',
    prev_hash: "a".repeat(64),
    entry_hash: "b".repeat(64),
    created_at: "2026-08-30T10:00:01Z",
  },
];

const STATS: MerchantStats = {
  merchant_id: "merchant_001",
  window_hours: 24,
  window_start: "2026-08-29T10:00:00Z",
  failures_observed: 120,
  decisions_made: 118,
  decisions_permitted: 96,
  decisions_refused_by_bounds: 22,
  expected_net_value_paise_permitted: 1_450_000,
  taxonomy_breakdown: { ISSUER_OUTAGE: 70, INSUFFICIENT_FUNDS: 40, UNCLASSIFIED: 10 },
  action_breakdown: { SWITCH_RAIL: 60, RETRY_SCHEDULED: 36, NO_ACTION: 22 },
  truncated: false,
};

function brainStub(overrides: Partial<BrainClient> = {}): BrainClient {
  return {
    getRailHealth: async () => RAIL_MATRIX,
    getAttempt: async () => ATTEMPT,
    diagnose: async () => DIAGNOSIS,
    decide: async () => DECISION,
    ...overrides,
  } as unknown as BrainClient;
}

function coreStub(overrides: Partial<CoreClient> = {}): CoreClient {
  return {
    getMerchantStats: async () => STATS,
    getLedgerEntries: async () => LEDGER,
    verifyLedger: async (): Promise<ChainVerification> => ({
      merchant_id: "merchant_001",
      valid: true,
      verified_entries: 42,
      head_hash: "b".repeat(64),
      failure_index: null,
      failure_reason: null,
    }),
    ...overrides,
  } as unknown as CoreClient;
}

describe("get_rail_health", () => {
  it("reports every observed rail with the fields the service actually serves", async () => {
    const res = await handleGetRailHealth({}, brainStub());
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.observed_rail_count).toBe(3);
    expect(parsed.rails[0].success_rate_5m).toBe("98.1%");
    // Fields the service does not serve must not appear at all.
    expect(parsed.rails[0].p95_latency_ms).toBeUndefined();
    expect(parsed.rails[0].error_rate_1m).toBeUndefined();
  });

  it("filters to one rail", async () => {
    const res = await handleGetRailHealth({ rail_id: "issuer_gamma|upi|simulated" }, brainStub());
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.rail_id).toBe("issuer_gamma|upi|simulated");
    expect(parsed.state).toBe("DOWN");
  });

  it("distinguishes an unknown rail from an empty sensing matrix", async () => {
    const empty = brainStub({
      getRailHealth: async () => ({ timestamp: "2026-08-30T10:00:00Z", rails: [] }),
    } as Partial<BrainClient>);
    const res = await handleGetRailHealth({ rail_id: "issuer_alpha|upi|simulated" }, empty);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error).toBe("rail_not_observed");
    expect(parsed.detail).toContain("no attempts have been observed");
  });
});

describe("list_open_incidents", () => {
  it("returns degraded and down rails at DEGRADED severity", async () => {
    const res = await handleListOpenIncidents({ min_severity: "DEGRADED" }, brainStub());
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.open_incident_count).toBe(2);
  });

  it("returns only down rails at DOWN severity", async () => {
    const res = await handleListOpenIncidents({ min_severity: "DOWN" }, brainStub());
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.open_incident_count).toBe(1);
    expect(parsed.incidents[0].affected_rail).toBe("issuer_gamma|upi|simulated");
  });

  it("does not recommend an action per incident", async () => {
    // Choosing an action is the policy engine's job and depends on the payer,
    // not just the rail. A recommendation surfaced here would reach an
    // operator without having passed the bounds engine.
    const res = await handleListOpenIncidents({ min_severity: "DEGRADED" }, brainStub());
    expect(res.content[0].text).not.toContain("recommended_action");
  });
});

describe("explain_decision", () => {
  it("explains a real attempt from real responses", async () => {
    const res = await handleExplainDecision(
      { merchant_id: "merchant_001", payment_attempt_id: "pay_1" },
      brainStub(),
      coreStub(),
    );
    const text = res.content[0].text;
    expect(text).toContain("₹2499.00");
    expect(text).toContain("SIM_ISSUER_UNAVAILABLE");
    expect(text).toContain("`SWITCH_RAIL`");
    expect(text).toContain("b".repeat(64));
  });

  it("says so plainly when the attempt does not exist", async () => {
    // The old implementation answered this case with a complete, confident
    // explanation assembled entirely from `||` fallbacks.
    const res = await handleExplainDecision(
      { merchant_id: "merchant_001", payment_attempt_id: "nope" },
      brainStub({ getAttempt: async () => null } as Partial<BrainClient>),
      coreStub(),
    );
    const text = res.content[0].text;
    expect(text).toContain("No such payment attempt");
    expect(text).not.toContain("SWITCH_RAIL");
    expect(text).not.toContain("Bounds Engine Verdict");
  });

  it("reports a missing diagnosis instead of inventing one", async () => {
    const res = await handleExplainDecision(
      { merchant_id: "merchant_001", payment_attempt_id: "pay_1" },
      brainStub({ diagnose: async () => null } as Partial<BrainClient>),
      coreStub(),
    );
    expect(res.content[0].text).toContain("no diagnosis for this attempt");
  });

  it("propagates a backend failure rather than describing a decision it never got", async () => {
    await expect(
      handleExplainDecision(
        { merchant_id: "merchant_001", payment_attempt_id: "pay_1" },
        brainStub({
          decide: async () => {
            throw new BackendError("salvage-brain", "down");
          },
        } as Partial<BrainClient>),
        coreStub(),
      ),
    ).rejects.toBeInstanceOf(BackendError);
  });
});

describe("get_recovery_stats", () => {
  it("reports counted activity and no recovery rate", async () => {
    const res = await handleGetRecoveryStats(
      { merchant_id: "merchant_001", time_window_hours: 24 },
      coreStub(),
    );
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.failures_observed).toBe(120);
    expect(parsed.decisions_refused_by_bounds).toBe(22);
    expect(parsed.expected_net_value_permitted_rupees).toBe("14500.00");
    // salvage-core cannot establish either of these yet, so neither is served.
    expect(parsed.recovery_rate).toBeUndefined();
    expect(parsed.gross_recovered_rupees).toBeUndefined();
  });

  it("labels the expected value as a model estimate", async () => {
    const res = await handleGetRecoveryStats({ merchant_id: "m", time_window_hours: 24 }, coreStub());
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.notes.join(" ")).toContain("not money observed to have been recovered");
  });

  it("warns when the window was truncated", async () => {
    const res = await handleGetRecoveryStats(
      { merchant_id: "m", time_window_hours: 24 },
      coreStub({ getMerchantStats: async () => ({ ...STATS, truncated: true }) } as Partial<CoreClient>),
    );
    expect(JSON.parse(res.content[0].text).notes.join(" ")).toContain("lower bounds");
  });
});

describe("verify_ledger", () => {
  it("reports an intact chain", async () => {
    const res = await handleVerifyLedger({ merchant_id: "merchant_001" }, coreStub());
    expect(res.content[0].text).toContain("INTACT");
    expect(res.content[0].text).toContain("42");
  });

  it("reports where a tampered chain breaks", async () => {
    const res = await handleVerifyLedger(
      { merchant_id: "merchant_001" },
      coreStub({
        verifyLedger: async () => ({
          merchant_id: "merchant_001",
          valid: false,
          verified_entries: 11,
          head_hash: null,
          failure_index: 12,
          failure_reason: "Tampered entry_hash at entry 12",
        }),
      } as Partial<CoreClient>),
    );
    const text = res.content[0].text;
    expect(text).toContain("TAMPERED");
    expect(text).toContain("#12");
  });

  it("does not present an empty chain as evidence of recorded activity", async () => {
    const res = await handleVerifyLedger(
      { merchant_id: "merchant_001" },
      coreStub({
        verifyLedger: async () => ({
          merchant_id: "merchant_001",
          valid: true,
          verified_entries: 0,
          head_hash: null,
          failure_index: null,
          failure_reason: null,
        }),
      } as Partial<CoreClient>),
    );
    expect(res.content[0].text).toContain("not evidence that anything was recorded");
  });
});
