"use client";

import React from "react";
import { Chip } from "@/components/ui/Primitives";
import { covers, domainFor, positionIn, ticksFor, type Domain } from "@/lib/chart";
import { formatAxisRupees, formatMeanPaise } from "@/lib/formatters";
import type { PolicySummary } from "@/types";

export function ForestPlot({ policies }: { policies: PolicySummary[] }): React.ReactElement {
  const domain = domainOf(policies);
  const ticks = ticksFor(domain);

  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        Doubly-robust estimate with 95% confidence interval against known ground truth, per policy.
      </figcaption>

      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.08] mb-4">
        <div className="flex items-center gap-4 text-[11px] font-mono text-fg-muted">
          <Key className="h-2.5 w-6 rounded-full bg-gradient-to-r from-iris/60 to-cyber-cyan/60 shadow-[0_0_8px_rgba(99,102,241,0.5)]" label="95% CI (Doubly-Robust)" />
          <Key className="h-3 w-3 rounded-full bg-iris shadow-[0_0_10px_rgba(99,102,241,0.8)] border border-white/50" label="Point Estimate" />
          <Key className="h-4 w-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" label="Ground Truth ($V^*$)" />
        </div>

        <span className="text-[10px] font-mono text-fg-faint">Statistical Coverage Test</span>
      </div>

      <div className="space-y-2">
        {policies.map((policy) => (
          <Row key={policy.policy_name} policy={policy} domain={domain} />
        ))}
      </div>

      {/* Axis */}
      <div className="mt-3 grid grid-cols-[minmax(8rem,16rem)_1fr] items-start gap-4 border-t border-white/[0.08] pt-3">
        <span className="eyebrow text-[10.5px]">Mean Value Per Failure</span>
        <div className="relative h-5">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute -translate-x-1/2 font-mono text-[10.5px] font-bold text-fg-muted"
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
    <div className="grid grid-cols-[minmax(8rem,16rem)_1fr] items-center gap-4 group">
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-bold text-white group-hover:text-iris transition-colors" title={policy.policy_name}>
          {policy.policy_name}
        </p>
        <p className="num font-mono text-[11px] text-fg-muted">
          Truth: <span className="text-white font-bold">{formatMeanPaise(truth)}</span>
        </p>
      </div>

      <div
        className="relative h-11 rounded-xl border border-white/10 bg-black/30 backdrop-blur-md shadow-inner transition-all group-hover:border-white/20"
        title={
          `${policy.policy_name}\n` +
          `ground truth ${formatMeanPaise(truth)}\n` +
          `doubly robust ${formatMeanPaise(dr.estimated_value)} ` +
          `[${formatMeanPaise(dr.ci_lower)}, ${formatMeanPaise(dr.ci_upper)}]\n` +
          `the interval ${covered ? "covers" : "does not cover"} the truth`
        }
      >
        {ticksBackdrop(domain)}

        {/* 95% Confidence Interval Bar */}
        <span
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-gradient-to-r from-iris/50 via-cyber-cyan/50 to-iris/50 shadow-[0_0_12px_rgba(99,102,241,0.3)]"
          style={{ left: `${left}%`, width: `${Math.max(right - left, 0.6)}%` }}
        />
        {[left, right].map((edge, index) => (
          <span
            key={index}
            className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-iris shadow-[0_0_8px_rgba(99,102,241,0.8)]"
            style={{ left: `${edge}%` }}
          />
        ))}

        {/* Doubly Robust Point Estimate Dot */}
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2 border-iris shadow-[0_0_12px_rgba(99,102,241,1)] z-10"
          style={{ left: `${positionIn(dr.estimated_value, domain)}%` }}
        />

        {/* Ground Truth Marker Pin */}
        <span
          className="absolute top-1/2 h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] z-20"
          style={{ left: `${positionIn(truth, domain)}%` }}
        />

        {/* Status Tag */}
        <span
          className={`absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
            covered
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
              : "border-rose-500/40 bg-rose-500/15 text-rose-400"
          }`}
        >
          {covered ? "✓ covers" : "✕ misses"}
        </span>

        {!dr.is_identifiable ? (
          <span className="absolute left-3 top-1/2 -translate-y-1/2">
            <Chip tone="down">not identifiable</Chip>
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
          className="absolute inset-y-0 w-px bg-white/[0.04]"
          style={{ left: `${positionIn(tick, domain)}%` }}
          aria-hidden
        />
      ))}
    </>
  );
}

function Key({ className, label }: { className: string; label: string }): React.ReactElement {
  return (
    <span className="flex items-center gap-2 font-semibold">
      <span className={className} />
      <span>{label}</span>
    </span>
  );
}

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
