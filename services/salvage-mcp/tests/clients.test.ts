import { describe, expect, it } from "vitest";
import { BrainClient } from "../src/clients/brainClient.js";
import { CoreClient } from "../src/clients/coreClient.js";

describe("Salvage MCP Clients", () => {
  it("BrainClient returns fallback rail health if offline", async () => {
    const client = new BrainClient("http://localhost:9999");
    const health = await client.getRailHealth();
    expect(health.rails).toBeDefined();
    expect(health.rails["HDFC|UPI|RAZORPAY"]).toBeDefined();
    expect(health.rails["HDFC|UPI|RAZORPAY"].state).toBe("HEALTHY");
  });

  it("CoreClient returns fallback merchant stats if offline", async () => {
    const client = new CoreClient("http://localhost:9999");
    const stats = await client.getMerchantStats("m_fallback_1", 24);
    expect(stats.merchant_id).toBe("m_fallback_1");
    expect(stats.recovery_rate_pct).toBeGreaterThan(0);
    expect(stats.gross_recovered_paise).toBeGreaterThan(0);
  });

  it("CoreClient returns fallback ledger audit records if offline", async () => {
    const client = new CoreClient("http://localhost:9999");
    const entries = await client.getLedgerEntries("m_fallback_1", 5);
    expect(entries).toBeInstanceOf(Array);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].event_type).toBe("DECISION_PERMITTED");
  });
});
