"use client";

import { Award, Check, Sparkles, X } from "lucide-react";
import React from "react";
import { formatPercent, formatRupeesDetailed } from "@/lib/formatters";
import { ActionValuationDetail } from "@/types";

interface ActionRankingTableProps {
  actions: ActionValuationDetail[];
}

export function ActionRankingTable({
  actions,
}: ActionRankingTableProps): React.ReactElement {
  return (
    <div className="w-full rounded-2xl liquid-glass p-5 sm:p-6 shadow-2xl border border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm sm:text-base font-serif font-bold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-400" />
            Counterfactual Expected Net Utility Optimization
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 font-sans">
            Objective: $\mathbb&#123;E&#125;[\text&#123;Net Value&#125;(a)] = P(\text&#123;recovery&#125;|a) \times \text&#123;amount&#125; - \text&#123;cost&#125;(a) - \text&#123;friction&#125;(a)$
          </p>
        </div>
        <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 font-bold shadow-[0_0_15px_rgba(16,185,129,0.2)]">
          Optimal: SWITCH_RAIL
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-white/5 text-[10px] text-slate-400 uppercase tracking-wider">
              <th className="pb-3 pr-4 font-normal">Candidate Action</th>
              <th className="pb-3 px-3 font-normal text-right">P(Recovery)</th>
              <th className="pb-3 px-3 font-normal text-right">Gross Payoff</th>
              <th className="pb-3 px-3 font-normal text-right">Cost + Friction</th>
              <th className="pb-3 px-3 font-normal text-right font-bold text-slate-200">
                E[Net Utility]
              </th>
              <th className="pb-3 px-3 font-normal text-center">Bounds</th>
              <th className="pb-3 pl-3 font-normal text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {actions.map((act) => (
              <tr
                key={act.action}
                className={`transition-colors ${
                  act.is_chosen
                    ? "bg-emerald-950/20 font-semibold"
                    : "hover:bg-white/[0.02]"
                }`}
              >
                <td className="py-3.5 pr-4 flex items-center gap-2">
                  {act.is_chosen && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  )}
                  <span
                    className={
                      act.is_chosen ? "text-emerald-300 font-bold" : "text-slate-300"
                    }
                  >
                    {act.action}
                  </span>
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-slate-300">
                  {formatPercent(act.probability)}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-slate-300">
                  {formatRupeesDetailed(act.gross_expected_paise)}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-slate-400">
                  {formatRupeesDetailed(
                    act.cost_paise + act.friction_penalty_paise
                  )}
                </td>
                <td
                  className={`py-3.5 px-3 text-right tabular-nums font-bold ${
                    act.is_chosen
                      ? "text-emerald-400 text-sm"
                      : act.net_utility_paise > 0
                      ? "text-slate-200"
                      : "text-slate-500"
                  }`}
                >
                  {formatRupeesDetailed(act.net_utility_paise)}
                </td>
                <td className="py-3.5 px-3 text-center">
                  {act.is_permitted_by_bounds ? (
                    <span className="inline-flex items-center text-emerald-400">
                      <Check className="w-4 h-4" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-rose-400">
                      <X className="w-4 h-4" />
                    </span>
                  )}
                </td>
                <td className="py-3.5 pl-3 text-center">
                  {act.is_chosen ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400 text-slate-950 shadow-md">
                      SELECTED
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 uppercase">
                      Rejected
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
