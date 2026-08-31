"use client";

import React from "react";
import { Chip } from "@/components/ui/Primitives";
import { covers, domainFor, positionIn, ticksFor, type Domain } from "@/lib/chart";
import { formatAxisRupees, formatMeanPaise } from "@/lib/formatters";
import type { PolicySummary } from "@/types";

/**
 * Each policy's doubly-robust estimate, its 95% interval, and the truth.
 *
 * This chart is the evaluation's actual finding, and the table it sits above
 * cannot show it. The question the harness exists to answer is not "which
 * policy scored highest" — the ground-truth column already says that. It is
 * **does the estimator recover a value we independently know?** That is a
 * question about whether each interval covers its truth marker, and coverage is
 * a spatial relationship. In a table it is arithmetic the reader has to do
 * seven times; here it is visible at a glance, including where it fails.
 *
 * Positioned with CSS percentages rather than drawn in SVG. A `<svg>` with
 * `preserveAspectRatio="none"` stretched to the container width would turn the
 * estimate dots into ellipses, and keeping the aspect ratio would leave the
 * plot unable to fill a panel. Percentages have neither problem and reflow for
 * free.
 *
 * **Colour.** The state palette is not used here, because there are no rails on
 * this screen and emerald has one meaning in this console. The interval is the
 * accent; the truth marker is plain foreground. The only exception is the
 * not-identifiable chip, which is rose for the same reason rose is rose
 * everywhere else: this one is broken.
 */
export function ForestPlot({ policies }: { policies: PolicySummary[] }): React.ReactElement {
  const domain = domainOf(policies);
  const ticks = ticksFor(domain);

  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        Doubly-robust estimate with 95% confidence interval against known ground truth, per policy.
      </figcaption>

      <div className="flex items-center gap-3 pb-3 text-[10px] text-fg-faint">
        <Key className="h-2 w-6 rounded-full bg-iris/45" label="95% CI" />
        <Key className="h-2 w-2 rounded-full bg-iris" label="doubly-robust estimate" />
        <Key className="h-3 w-0.5 bg-fg" label="ground truth" />
      </div>

      <div className="space-y-1">
        {policies.map((policy) => (
          <Row key={policy.policy_name} policy={policy} domain={domain} />
        ))}
      </div>

      {/* The axis sits under the rows, sharing their grid so ticks line up. */}
      <div className="mt-1 grid grid-cols-[minmax(7rem,14rem)_1fr] items-start gap-3 border-t border-white/[0.07] pt-2">
        <span className="eyebrow">Mean value per failure</span>
        <div className="relative h-4">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute -translate-x-1/2 font-mono text-[10px] text-fg-faint"
              style={{ left: `${positionIn(tick, domain)}%` }}
            >
              {formatAxisRupees(tick)}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

function Row({
  policy,
  domain,
}: {
  policy: PolicySummary;
  domain: Domain;
}): React.ReactElement {
  const dr = policy.doubly_robust;
  const truth = policy.ground_truth_value;
  const covered = covers({ lower: dr.ci_lower, upper: dr.ci_upper }, truth);

  const left = positionIn(dr.ci_lower, domain);
  const right = positionIn(dr.ci_upper, domain);

  return (
    <div className="grid grid-cols-[minmax(7rem,14rem)_1fr] items-center gap-3">
      <div className="min-w-0">
        <p className="truncate text-[11px] text-fg" title={policy.policy_name}>
          {policy.policy_name}
        </p>
        <p className="num font-mono text-[10px] text-fg-faint">
          {formatMeanPaise(truth)}
        </p>
      </div>

      <div
        className="relative h-9 rounded-md border border-white/[0.07] bg-white/[0.02]"
        title={
          `${policy.policy_name}\n` +
          `ground truth ${formatMeanPaise(truth)}\n` +
          `doubly robust ${formatMeanPaise(dr.estimated_value)} ` +
          `[${formatMeanPaise(dr.ci_lower)}, ${formatMeanPaise(dr.ci_upper)}]\n` +
          `the interval ${covered ? "covers" : "does not cover"} the truth`
        }
      >
        {ticksBackdrop(domain)}

        {/* The interval. */}
        <span
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-iris/40"
          style={{ left: `${left}%`, width: `${Math.max(right - left, 0.4)}%` }}
        />
        {/* Its endpoints, so a very narrow interval is still visible. */}
        {[left, right].map((edge, index) => (
          <span
            key={index}
            className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-iris/70"
            style={{ left: `${edge}%` }}
          />
        ))}

        {/* The estimate. */}
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-iris shadow-[0_0_0_3px] shadow-ink-1"
          style={{ left: `${positionIn(dr.estimated_value, domain)}%` }}
        />

        {/* The answer key. Deliberately a different shape, not a different
            colour: the two marks mean different kinds of thing, and shape
            survives being printed, screenshotted, or read by someone who does
            not distinguish the hues. */}
        <span
          className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-fg"
          style={{ left: `${positionIn(truth, domain)}%` }}
        />

        <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] uppercase tracking-wider text-fg-faint">
          {covered ? "covers" : "misses"}
        </span>

        {!dr.is_identifiable ? (
          <span className="absolute left-2 top-1/2 -translate-y-1/2">
            <Chip>not identifiable</Chip>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ticksBackdrop(domain: Domain): React.ReactElement {
  return (
    <>
      {ticksFor(domain).map((tick) => (
        <span
          key={tick}
          className="absolute inset-y-0 w-px bg-white/[0.05]"
          style={{ left: `${positionIn(tick, domain)}%` }}
          aria-hidden
        />
      ))}
    </>
  );
}

function Key({ className, label }: { className: string; label: string }): React.ReactElement {
  return (
    <span className="flex items-center gap-1.5">
      <span className={className} />
      {label}
    </span>
  );
}

/** Every point that will be drawn, so nothing is clipped off the edge. */
function domainOf(policies: PolicySummary[]): Domain {
  return domainFor(
    policies.flatMap((policy) => [
      policy.ground_truth_value,
      policy.doubly_robust.ci_lower,
      policy.doubly_robust.ci_upper,
      policy.doubly_robust.estimated_value,
    ]),
  );
}
