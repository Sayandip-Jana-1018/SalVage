import { describe, expect, it } from "vitest";
import {
  formatAge,
  formatCount,
  formatPaise,
  formatPercent,
  formatRupeesWhole,
  groupIndian,
  stateClass,
} from "../src/lib/formatters.js";

/**
 * The console has no fixture, so the only things worth unit-testing here are
 * the pure display helpers. Whether it renders live data correctly is covered
 * by `npm run build`, which type-checks every route and page against the wire
 * types, and end to end by `make demo` plus the checkout page.
 *
 * The tests this file replaces asserted properties of a checked-in fixture:
 * that `initialRailGrid` covered "all 4 major banks", and that
 * `sampleAutopsyDetail` contained a verified hash chain with 64-character
 * hashes. Both passed and neither told anyone anything — the chain was
 * "verified" because a boolean in the file said so.
 */

describe("money, formatted from integer paise", () => {
  it("renders paise as rupees with two places", () => {
    expect(formatPaise(185000)).toBe("₹1,850.00");
    expect(formatPaise(1)).toBe("₹0.01");
    expect(formatPaise(0)).toBe("₹0.00");
  });

  it("never loses a paisa to floating point", () => {
    // The case that motivates integer arithmetic: 1999 / 100 is not 19.99 in
    // binary floating point. Doubling it is where the error would surface.
    expect(formatPaise(1999)).toBe("₹19.99");
    expect(formatPaise(3998)).toBe("₹39.98");
    expect(formatPaise(999999999)).toBe("₹99,99,999.99");
  });

  it("groups the Indian way", () => {
    expect(groupIndian(1234567)).toBe("12,34,567");
    expect(groupIndian(1000)).toBe("1,000");
    expect(groupIndian(999)).toBe("999");
    expect(formatPaise(100000000000)).toBe("₹1,00,00,00,000.00");
  });

  it("puts the sign outside the symbol", () => {
    expect(formatPaise(-500)).toBe("-₹5.00");
  });

  it("renders zero rather than blank", () => {
    // A dashboard that shows nothing for zero is indistinguishable from one
    // that failed to load.
    expect(formatRupeesWhole(0)).toBe("₹0");
    expect(formatCount(0)).toBe("0");
  });

  it("truncates rather than rounding up in the whole-rupee form", () => {
    // Understating a recovered amount is the safer direction to be wrong in.
    expect(formatRupeesWhole(185099)).toBe("₹1,850");
  });
});

describe("percentages", () => {
  it("renders a fraction to one decimal place", () => {
    expect(formatPercent(0.53)).toBe("53.0%");
    expect(formatPercent(0.012)).toBe("1.2%");
  });

  it("renders the endpoints exactly", () => {
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(1)).toBe("100.0%");
  });
});

describe("age", () => {
  const now = new Date("2026-08-31T12:00:00Z");

  it("counts down through the units", () => {
    expect(formatAge("2026-08-31T11:59:48Z", now)).toBe("12s ago");
    expect(formatAge("2026-08-31T11:45:00Z", now)).toBe("15m ago");
    expect(formatAge("2026-08-31T09:00:00Z", now)).toBe("3h ago");
    expect(formatAge("2026-08-29T12:00:00Z", now)).toBe("2d ago");
  });

  it("does not render an unparseable timestamp as fresh", () => {
    expect(formatAge("not a date", now)).toBe("—");
  });
});

describe("state colours", () => {
  it("maps each state to its own class", () => {
    expect(stateClass("HEALTHY")).toBe("state-healthy");
    expect(stateClass("DEGRADED")).toBe("state-degraded");
    expect(stateClass("DOWN")).toBe("state-down");
  });

  it("does not render an unknown state as healthy", () => {
    // Painting a state the console does not understand as one it has verified
    // is fine is how an outage reads as an all-clear.
    expect(stateClass("SOMETHING_ELSE")).toBe("state-unobserved");
    expect(stateClass("")).toBe("state-unobserved");
  });
});
