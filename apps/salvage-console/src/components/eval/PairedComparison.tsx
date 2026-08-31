"use client";

import React from "react";
import { formatPercent, formatSignedMeanPaise } from "@/lib/formatters";
import type { PairedComparison as Comparison } from "@/types";

/**
 * One policy against another, on the same resampled episodes.
 *
 * The whole finding is whether the interval crosses zero, so the interval is
 * drawn on an axis with zero fixed in it and the reader is asked to look at one
 * thing. A number and a bracket in a sentence make that a piece of arithmetic;
 * a line that clears a marked point makes it a glance.
 *
 * **Both comparisons are shown, including the one that fails.** The evaluation
 * runs this twice: the policy against the strongest simple baseline, which
 * clears zero, and the fitted challenger against the shipped policy, which does
 * not. Showing only the first would be the same dishonesty as reporting a
 * favourable estimator and dropping the others, and the second is the more
 * interesting result — it is the harness declining to claim an improvement it
 * cannot support.
 *
 * Why paired: one resample, both policies scored on it, the per-episode
 * difference bootstrapped. Comparing two independently-built intervals and
 * checking for overlap throws away the variance the two policies share and is
 * badly under-powered. On this dataset the overlap test calls the margin below
 * indistinguishable from zero; the paired test on the same episodes does not.
 */
export function PairedComparison({
  comparison,
  title,
  note,
}: {
  comparison: Comparison;
  title: string;
  note: string;
}): React.ReactElement {
  const { ci_lower_paise: lower, ci_upper_paise: upper } = comparison;
  const decisive = comparison.distinguishable_from_zero;

  // A symmetric domain keeps zero in the middle, so "how far from zero" reads
  // the same way in both directions and the two cards stay comparable.
  const reach = Math.max(Math.abs(lower), Math.abs(upper)) * 1.25 || 1;
  const at = (value: number) => ((value + reach) / (2 * reach)) * 100;

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-4">
      <p className="eyebrow">{title}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">
        <span className="font-mono text-fg">{comparison.challenger}</span> against{" "}
        <span className="font-mono text-fg">{comparison.champion}</span>
      </p>

      <p
        className={`num mt-3 font-mono text-2xl font-semibold tracking-[-0.02em] ${
          decisive ? "text-fg" : "text-fg-muted"
        }`}
      >
        {formatSignedMeanPaise(comparison.mean_difference_paise)}
      </p>
      <p className="num font-mono text-[11px] text-fg-faint">
        95% CI [{formatSignedMeanPaise(lower)}, {formatSignedMeanPaise(upper)}] per failure
      </p>

      <div className="relative mt-4 h-8">
        <span className="absolute inset-y-0 w-px bg-fg-faint/70" style={{ left: "50%" }} />
        <span className="absolute -top-0.5 -translate-x-1/2 font-mono text-[9px] text-fg-faint" style={{ left: "50%" }}>
          0
        </span>
        <span
          className={`absolute bottom-2 h-2 rounded-full ${decisive ? "bg-iris/60" : "bg-fg-faint/35"}`}
          style={{ left: `${at(lower)}%`, width: `${Math.max(at(upper) - at(lower), 0.6)}%` }}
        />
        <span
          className={`absolute bottom-1.5 h-3 w-3 -translate-x-1/2 rounded-full ${
            decisive ? "bg-iris" : "bg-fg-faint"
          }`}
          style={{ left: `${at(comparison.mean_difference_paise)}%` }}
        />
      </div>

      <p className={`mt-2 text-[11px] leading-relaxed ${decisive ? "text-fg" : "text-fg-muted"}`}>
        <span className="font-mono uppercase tracking-wider">
          {decisive ? "excludes zero" : "includes zero"}
        </span>{" "}
        — {note}
      </p>
      <p className="mt-1.5 font-mono text-[10px] text-fg-faint">
        the two policies chose differently on {formatPercent(comparison.disagreement_rate)} of
        episodes; identical choices carry no information either way
      </p>
    </div>
  );
}
