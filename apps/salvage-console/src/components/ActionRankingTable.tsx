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
    <div className="w-full rounded-2xl liquid-glass p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm sm:text-base font-serif font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-600" />
            Counterfactual Expected Net Utility Optimization
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 font-sans">
            Objective: $\mathbb&#123;E&#125;[\text&#123;Net Value&#125;(a)] = P(\text&#123;recovery&#125;|a) \times \text&#123;amount&#125; - \text&#123;cost&#125;(a) - \text&#123;friction&#125;(a)$
          </p>
        </div>
        <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold shadow-sm">
          Optimal: SWITCH_RAIL
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider">
              <th className="pb-3 pr-4 font-semibold">Candidate Action</th>
              <th className="pb-3 px-3 font-semibold text-right">P(Recovery)</th>
              <th className="pb-3 px-3 font-semibold text-right">Gross Payoff</th>
              <th className="pb-3 px-3 font-semibold text-right">Cost + Friction</th>
              <th className="pb-3 px-3 font-semibold text-right font-bold text-slate-900">
                E[Net Utility]
              </th>
              <th className="pb-3 px-3 font-semibold text-center">Bounds</th>
              <th className="pb-3 pl-3 font-semibold text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {actions.map((act) => (
              <tr
                key={act.action}
                className={`transition-colors ${
                  act.is_chosen
                    ? "bg-emerald-50/50 font-semibold"
                    : "hover:bg-slate-50"
                }`}
              >
                <td className="py-3.5 pr-4 flex items-center gap-2">
                  {act.is_chosen && (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  )}
                  <span
                    className={
                      act.is_chosen ? "text-emerald-900 font-bold" : "text-slate-700"
                    }
                  >
                    {act.action}
                  </span>
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-slate-700">
                  {formatPercent(act.probability)}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-slate-700">
                  {formatRupeesDetailed(act.gross_expected_paise)}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-slate-500">
                  {formatRupeesDetailed(
                    act.cost_paise + act.friction_penalty_paise
                  )}
                </td>
                <td
                  className={`py-3.5 px-3 text-right tabular-nums font-bold ${
                    act.is_chosen
                      ? "text-emerald-700 text-sm"
                      : act.net_utility_paise > 0
                      ? "text-slate-800"
                      : "text-slate-400"
                  }`}
                >
                  {formatRupeesDetailed(act.net_utility_paise)}
                </td>
                <td className="py-3.5 px-3 text-center">
                  {act.is_permitted_by_bounds ? (
                    <span className="inline-flex items-center text-emerald-600">
                      <Check className="w-4 h-4" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-rose-600">
                      <X className="w-4 h-4" />
                    </span>
                  )}
                </td>
                <td className="py-3.5 pl-3 text-center">
                  {act.is_chosen ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-white shadow-sm">
                      SELECTED
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 uppercase font-medium">
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
