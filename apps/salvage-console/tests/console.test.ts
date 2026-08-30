import { describe, expect, it } from "vitest";
import { formatPercent, formatRupees, getHealthColorClass } from "../src/lib/formatters.js";

/**
 * The tests this file replaces asserted properties of a checked-in fixture:
 * that `initialRailGrid` covered "all 4 major banks", and that
 * `sampleAutopsyDetail` contained a verified hash chain with 64-character
 * hashes. Both passed. Neither told anyone anything, because the fixture was
 * hand-written -- the hash chain was "verified" because a boolean in the file
 * said so, and the four banks were four string literals.
 *
 * The console now has no fixture. Its data comes from salvage-brain and
 * salvage-core through route handlers under `src/app/api`, so the only things
 * worth unit-testing here are the pure display helpers. Whether the console
 * renders live data correctly is exercised by `npm run build` (which
 * type-checks every route and page against the wire types) and, end to end, by
 * `make demo` plus the checkout page.
 */

describe("currency formatting", () => {
  it("renders paise as rupees", () => {
    expect(formatRupees(150000)).toContain("1,500");
  });

  it("renders zero rather than blank", () => {
    // A dashboard that shows nothing for zero is indistinguishable from one
    // that failed to load.
    expect(formatRupees(0)).toContain("0");
  });
});

describe("percentage formatting", () => {
  it("renders a fraction to one decimal place", () => {
    expect(formatPercent(0.53)).toBe("53.0%");
    expect(formatPercent(0.012)).toBe("1.2%");
  });

  it("renders the endpoints exactly", () => {
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(1)).toBe("100.0%");
  });
});

describe("health state colours", () => {
  it("maps each state to a distinct palette", () => {
    expect(getHealthColorClass("HEALTHY").text).toContain("emerald");
    expect(getHealthColorClass("DEGRADED").text).toContain("amber");
    expect(getHealthColorClass("DOWN").text).toContain("rose");
  });

  it("does not render an unknown state as healthy", () => {
    // Defaulting an unrecognised state to green would paint a rail the
    // console does not understand as one it has verified is fine.
    expect(getHealthColorClass("SOMETHING_ELSE").text).not.toContain("emerald");
  });
});
