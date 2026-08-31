import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { covers, domainFor, populatedDeciles, positionIn, ticksFor } from "../src/lib/chart.js";
import {
  formatAxisRupees,
  formatMeanPaise,
  formatSignedMeanPaise,
} from "../src/lib/formatters.js";
import type { EvaluationResults } from "../src/types/index.js";

/**
 * The arithmetic behind the evaluation charts.
 *
 * A chart is a claim about data, and these are the places where drawing it could
 * quietly make a different claim than the data does: a domain that clips the
 * point the reader most needs to see, an empty bin plotted as an observation of
 * zero, a mean rendered as though it were an amount of money.
 *
 * The last block reads the real `docs/evaluation-results.json` rather than a
 * fixture. If `make eval` produces a shape these charts cannot draw, that should
 * fail here rather than render as an empty panel.
 */

describe("means are not amounts of money", () => {
  it("renders a mean in paise, the unit the rest of the project uses", () => {
    // EVALUATION.md and HANDOFF both say "paise per failure". A console that
    // converted to rupees would make a reader compare two different numbers
    // across two screens.
    expect(formatMeanPaise(31401.47)).toBe("31,401.47 paise");
    expect(formatMeanPaise(113567.3)).toBe("1,13,567.30 paise");
  });

  it("keeps the fractional part that makes it a mean", () => {
    // 9682.5 truncated to 9682 would be a different claim: an average is
    // allowed a fraction of a paisa, an amount somebody pays is not.
    expect(formatMeanPaise(9682.5)).toBe("9,682.50 paise");
    expect(formatMeanPaise(0)).toBe("0.00 paise");
  });

  it("signs a difference, because the sign is the finding", () => {
    expect(formatSignedMeanPaise(9682.5)).toBe("+9,682.50 paise");
    expect(formatSignedMeanPaise(-294.47)).toBe("-294.47 paise");
    expect(formatSignedMeanPaise(0)).toBe("0.00 paise");
  });

  it("only loses precision on an axis tick, where it is a position and not a value", () => {
    expect(formatAxisRupees(31401.47)).toBe("₹314");
  });
});

describe("a domain that does not hide the interesting row", () => {
  it("covers every point it was given", () => {
    const domain = domainFor([100, -50, 900]);
    expect(domain.min).toBeLessThanOrEqual(-50);
    expect(domain.max).toBeGreaterThanOrEqual(900);
  });

  it("always includes zero, so intervals are read against it", () => {
    const domain = domainFor([500, 900]);
    expect(domain.min).toBeLessThanOrEqual(0);
  });

  it("does not collapse when every value is identical", () => {
    // A zero-width domain divides by zero and puts every mark on top of itself.
    const domain = domainFor([42, 42, 42]);
    expect(domain.max).toBeGreaterThan(domain.min);
    expect(Number.isFinite(positionIn(42, domain))).toBe(true);
  });

  it("survives being handed nothing", () => {
    expect(positionIn(0, domainFor([]))).toBeGreaterThanOrEqual(0);
  });

  it("places values inside the track", () => {
    const domain = domainFor([0, 100]);
    expect(positionIn(domain.min, domain)).toBeCloseTo(0);
    expect(positionIn(domain.max, domain)).toBeCloseTo(100);
    expect(positionIn(50, domain)).toBeGreaterThan(0);
    expect(positionIn(50, domain)).toBeLessThan(100);
  });

  it("puts a tick at each end", () => {
    const domain = { min: 0, max: 100 };
    expect(ticksFor(domain, 4)).toEqual([0, 25, 50, 75, 100]);
  });
});

describe("interval coverage", () => {
  it("is the question the harness exists to answer", () => {
    expect(covers({ lower: 10, upper: 20 }, 15)).toBe(true);
    expect(covers({ lower: 10, upper: 20 }, 25)).toBe(false);
  });

  it("is closed at both ends", () => {
    expect(covers({ lower: 10, upper: 20 }, 10)).toBe(true);
    expect(covers({ lower: 10, upper: 20 }, 20)).toBe(true);
  });
});

describe("empty calibration bins", () => {
  const bin = (decile: number, count: number, predicted: number, observed: number) => ({
    decile,
    bin_lower: predicted - 0.05,
    bin_upper: predicted + 0.05,
    predicted_mean: predicted,
    observed_mean: observed,
    count,
  });

  it("are dropped, because zero episodes is not an observation of zero", () => {
    // The single most likely way for a reliability diagram to lie. An empty bin
    // carries observed_mean 0, and plotting it puts a point on the floor that
    // reads as catastrophic miscalibration rather than as no data.
    const kept = populatedDeciles([bin(1, 0, 0.05, 0), bin(2, 40, 0.15, 0.12)]);
    expect(kept).toHaveLength(1);
    expect(kept[0].decile).toBe(2);
  });

  it("does not drop a bin that genuinely observed zero recoveries", () => {
    // count > 0 and observed_mean 0 is a real measurement, and an unflattering
    // one. Filtering on the observation rather than the count would delete it.
    const kept = populatedDeciles([bin(1, 25, 0.05, 0)]);
    expect(kept).toHaveLength(1);
  });
});

describe("the charts can draw what make eval actually produced", () => {
  const results = JSON.parse(
    readFileSync(path.join(process.cwd(), "..", "..", "docs", "evaluation-results.json"), "utf-8"),
  ) as EvaluationResults;

  it("has the fields the forest plot reads", () => {
    expect(results.policies.length).toBeGreaterThan(0);
    for (const policy of results.policies) {
      const dr = policy.doubly_robust;
      expect(typeof policy.ground_truth_value).toBe("number");
      expect(typeof dr.estimated_value).toBe("number");
      expect(dr.ci_lower).toBeLessThanOrEqual(dr.ci_upper);
    }
  });

  it("produces a finite position for every mark it will draw", () => {
    const domain = domainFor(
      results.policies.flatMap((policy) => [
        policy.ground_truth_value,
        policy.doubly_robust.ci_lower,
        policy.doubly_robust.ci_upper,
      ]),
    );
    for (const policy of results.policies) {
      for (const value of [
        policy.ground_truth_value,
        policy.doubly_robust.ci_lower,
        policy.doubly_robust.ci_upper,
      ]) {
        const at = positionIn(value, domain);
        expect(Number.isFinite(at)).toBe(true);
        expect(at).toBeGreaterThanOrEqual(0);
        expect(at).toBeLessThanOrEqual(100);
      }
    }
  });

  it("carries the paired comparison the headline cards render", () => {
    const paired = results.policy_vs_best_baseline;
    expect(paired).toBeDefined();
    // The paired shape names its fields with a _paise suffix, unlike the
    // estimator shape. Two shapes for two things, and a card reading the wrong
    // one renders undefined rather than failing, so it is pinned here.
    expect(typeof paired!.mean_difference_paise).toBe("number");
    expect(typeof paired!.ci_lower_paise).toBe("number");
    expect(typeof paired!.distinguishable_from_zero).toBe("boolean");
  });

  it("still reports the shadow comparison that fails to clear zero", () => {
    // Pinned deliberately. This is the harness declining to claim an
    // improvement it cannot support, and it is the result most likely to be
    // quietly dropped from a dashboard.
    const shadow = results.shadow_comparison;
    expect(shadow).toBeDefined();
    expect(shadow!.distinguishable_from_zero).toBe(false);
  });
});
