"use client";

import { Award, Check, X } from "lucide-react";
import { formatPercent, formatRupeesDetailed } from "@/lib/formatters";
import { ActionValuationDetail } from "@/types";

interface ActionRankingTableProps {
  actions: ActionValuationDetail[];
}

export function ActionRankingTable({ actions }: ActionRankingTableProps) {
  return (
    <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-400" />
            Counterfactual Expected Net Utility Optimization
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Objective: E[Net Value(a)] = P(recovery|a) × amount - cost(a) - friction(a)
          </p>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-semibold">
          Optimal: SWITCH_RAIL
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider">
              <th className="pb-2.5 pr-4 font-normal">Candidate Action</th>
              <th className="pb-2.5 px-3 font-normal text-right">P(Recovery)</th>
              <th className="pb-2.5 px-3 font-normal text-right">Gross Payoff</th>
              <th className="pb-2.5 px-3 font-normal text-right">Cost + Friction</th>
              <th className="pb-2.5 px-3 font-normal text-right font-bold text-slate-200">E[Net Utility]</th>
              <th className="pb-2.5 px-3 font-normal text-center">Bounds</th>
              <th className="pb-2.5 pl-3 font-normal text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {actions.map((act) => (
              <tr
                key={act.action}
                className={`transition-colors ${
                  act.is_chosen ? "bg-emerald-950/20 font-semibold" : "hover:bg-slate-800/20"
                }`}
              >
                <td className="py-2.5 pr-4 flex items-center gap-2">
                  {act.is_chosen && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                  <span className={act.is_chosen ? "text-emerald-300" : "text-slate-300"}>
                    {act.action}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-slate-300">
                  {formatPercent(act.probability)}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-slate-300">
                  {formatRupeesDetailed(act.gross_expected_paise)}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-slate-400">
                  {formatRupeesDetailed(act.cost_paise + act.friction_penalty_paise)}
                </td>
                <td
                  className={`py-2.5 px-3 text-right tabular-nums font-bold ${
                    act.is_chosen
                      ? "text-emerald-400 text-sm"
                      : act.net_utility_paise > 0
                      ? "text-slate-200"
                      : "text-slate-500"
                  }`}
                >
                  {formatRupeesDetailed(act.net_utility_paise)}
                </td>
                <td className="py-2.5 px-3 text-center">
                  {act.is_permitted_by_bounds ? (
                    <span className="inline-flex items-center text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-rose-400">
                      <X className="w-3.5 h-3.5" />
                    </span>
                  )}
                </td>
                <td className="py-2.5 pl-3 text-center">
                  {act.is_chosen ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-slate-950">
                      SELECTED
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 uppercase">Rejected</span>
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
