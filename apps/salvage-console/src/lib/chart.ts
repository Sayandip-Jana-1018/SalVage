/**
 * The arithmetic behind the evaluation charts.
 *
 * Separated from the components that draw them because these four functions
 * carry the properties that decide whether a chart tells the truth, and a
 * property worth stating is a property worth testing. Rendering is not tested
 * here; the console has no DOM test setup, and adding one to assert that a
 * `<circle>` exists would prove less than these do.
 */

import type { CalibrationDecile } from "@/types";

export interface Domain {
  min: number;
  max: number;
}

/**
 * The value range to draw, computed from every point that will be drawn.
 *
 * Includes interval endpoints *and* truth markers, with padding. A domain
 * derived from only the estimates would clip a truth marker that sits outside
 * them — which is exactly the case worth seeing, because it is the case where
 * the estimator missed.
 *
 * Zero is always included so that intervals are read against it rather than
 * against an arbitrary floor that makes every value look large.
 */
export function domainFor(values: number[]): Domain {
  if (values.length === 0) return { min: 0, max: 1 };
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const pad = (max - min) * 0.06 || 1;
  return { min: min - pad, max: max + pad };
}

/** Where a value sits across a track, as a percentage of its width. */
export function positionIn(value: number, domain: Domain): number {
  const span = domain.max - domain.min;
  if (span <= 0) return 50;
  return ((value - domain.min) / span) * 100;
}

/** Evenly spaced tick values across a domain, endpoints included. */
export function ticksFor(domain: Domain, count = 4): number[] {
  const step = (domain.max - domain.min) / count;
  return Array.from({ length: count + 1 }, (_, index) => domain.min + step * index);
}

/**
 * Whether a confidence interval contains a value.
 *
 * Inclusive at both ends, which is what a closed interval means. The evaluation
 * question this answers — does the estimate's interval cover the truth we
 * independently know — is the one the whole harness exists for.
 */
export function covers(interval: { lower: number; upper: number }, value: number): boolean {
  return interval.lower <= value && value <= interval.upper;
}

/**
 * Deciles that actually hold episodes.
 *
 * The single most likely way for a reliability diagram to lie. An empty bin
 * carries `observed_mean: 0`, and plotting it puts a point on the floor of the
 * chart that reads as catastrophic miscalibration when it is the absence of a
 * measurement. Dropping them is not smoothing the data — it is declining to
 * draw a measurement that was never taken.
 */
export function populatedDeciles(deciles: CalibrationDecile[]): CalibrationDecile[] {
  return deciles.filter((decile) => decile.count > 0);
}
