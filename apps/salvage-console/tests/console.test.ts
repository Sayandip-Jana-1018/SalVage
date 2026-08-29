import { describe, expect, it } from "vitest";
import { formatPercent, formatRupees, getHealthColorClass } from "../src/lib/formatters.js";
import { initialRailGrid, sampleAutopsyDetail } from "../src/lib/mockData.js";

describe("Salvage Console Formatters & Logic", () => {
  it("formatRupees formats paise into Indian Rupee currency string", () => {
    const formatted = formatRupees(150000);
    expect(formatted).toContain("1,500");
  });

  it("formatPercent formats decimals into percentage string", () => {
    expect(formatPercent(0.53)).toBe("53.0%");
    expect(formatPercent(0.012)).toBe("1.2%");
  });

  it("getHealthColorClass returns correct color tokens for health states", () => {
    expect(getHealthColorClass("HEALTHY").text).toContain("emerald");
    expect(getHealthColorClass("DEGRADED").text).toContain("amber");
    expect(getHealthColorClass("DOWN").text).toContain("rose");
  });

  it("initialRailGrid covers all 4 major banks across 3 payment methods", () => {
    const banks = new Set(initialRailGrid.map((r) => r.bank));
    expect(banks.size).toBe(4);
    expect(initialRailGrid.length).toBeGreaterThanOrEqual(10);
  });

  it("sampleAutopsyDetail selects action that strictly maximizes expected net utility", () => {
    const actions = sampleAutopsyDetail.actions_evaluated;
    const chosen = actions.find((a) => a.is_chosen);
    expect(chosen).toBeDefined();

    // Verify chosen action has highest net utility among permitted actions
    const permitted = actions.filter((a) => a.is_permitted_by_bounds);
    const highest = permitted.reduce((max, a) => (a.net_utility_paise > max.net_utility_paise ? a : max), permitted[0]);
    expect(chosen?.action).toBe(highest.action);
  });

  it("sampleAutopsyDetail contains verified cryptographic hash chain", () => {
    const proof = sampleAutopsyDetail.ledger_proof;
    expect(proof.verified).toBe(true);
    expect(proof.entry_hash).toHaveLength(64); // sha256 hex length
    expect(proof.previous_hash).toHaveLength(64);
  });
});
