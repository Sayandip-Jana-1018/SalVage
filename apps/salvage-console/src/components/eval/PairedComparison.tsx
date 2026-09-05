"use client";

import React from "react";
import { formatPercent, formatSignedMeanPaise } from "@/lib/formatters";
import type { PairedComparison as Comparison } from "@/types";

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

  const reach = Math.max(Math.abs(lower), Math.abs(upper)) * 1.25 || 1;
  const at = (value: number) => ((value + reach) / (2 * reach)) * 100;

  return (
    <div className={`rounded-2xl border p-5 backdrop-blur-md transition-all ${
      decisive
        ? "border-iris/40 bg-gradient-to-b from-iris/10 via-ink-2 to-black/40 shadow-[0_0_25px_rgba(99,102,241,0.2)]"
        : "border-white/10 bg-white/[0.03]"
    }`}>
      <div className="flex items-center justify-between">
        <span className="eyebrow text-[10.5px]">{title}</span>
        <span className={`px-2.5 py-0.5 rounded-full font-mono text-[9.5px] font-bold uppercase tracking-wider border ${
          decisive
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
            : "border-white/15 bg-white/5 text-fg-faint"
        }`}>
          {decisive ? "P < 0.05 Significant" : "Not Distinguishable"}
        </span>
      </div>

      <p className="mt-2 text-xs text-fg-muted font-mono">
        <span className="font-bold text-white">{comparison.challenger}</span> vs{" "}
        <span className="font-semibold text-fg-muted">{comparison.champion}</span>
      </p>

      <div className="mt-3.5 flex items-baseline gap-3">
        <p
          className={`num font-mono text-3xl font-black tracking-tight ${
            decisive ? "text-white drop-shadow-[0_0_12px_rgba(99,102,241,0.4)]" : "text-fg-muted"
          }`}
        >
          {formatSignedMeanPaise(comparison.mean_difference_paise)}
        </p>
        <span className="text-[11px] font-mono text-fg-faint">per failure</span>
      </div>

      <p className="num font-mono text-[11px] text-iris/80 mt-1 font-semibold">
        95% CI [{formatSignedMeanPaise(lower)}, {formatSignedMeanPaise(upper)}]
      </p>

      {/* Axis graphic */}
      <div className="relative mt-5 h-9 rounded-xl border border-white/10 bg-black/40 px-2">
        <span className="absolute inset-y-0 w-0.5 bg-white/30" style={{ left: "50%" }} />
        <span className="absolute -top-3 -translate-x-1/2 font-mono text-[9px] font-bold text-fg-faint" style={{ left: "50%" }}>
          0
        </span>
        
        {/* Interval Bar */}
        <span
          className={`absolute top-1/2 h-3 -translate-y-1/2 rounded-full ${
            decisive
              ? "bg-gradient-to-r from-iris to-cyber-cyan shadow-[0_0_12px_rgba(99,102,241,0.6)]"
              : "bg-fg-faint/40"
          }`}
          style={{ left: `${at(lower)}%`, width: `${Math.max(at(upper) - at(lower), 1)}%` }}
        />

        {/* Center Mean Dot */}
        <span
          className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-0 ${
            decisive ? "bg-white shadow-[0_0_12px_rgba(255,255,255,1)]" : "bg-fg-muted"
          }`}
          style={{ left: `${at(comparison.mean_difference_paise)}%` }}
        />
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed text-fg-muted">
        <span className={`font-mono font-bold uppercase tracking-wider ${decisive ? "text-emerald-400" : "text-fg-faint"}`}>
          {decisive ? "Excludes Zero" : "Includes Zero"}
        </span>{" "}
        — {note}
      </p>
      
      <p className="mt-2 font-mono text-[10px] text-fg-faint border-t border-white/5 pt-2">
        Policy decision disagreement rate: <span className="text-white font-bold">{formatPercent(comparison.disagreement_rate)}</span> of episodes
      </p>
    </div>
  );
}
