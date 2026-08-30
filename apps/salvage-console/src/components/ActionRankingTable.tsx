"use client";

import { Award, Check } from "lucide-react";
import React from "react";
import { formatPercent, formatRupeesDetailed } from "@/lib/formatters";
import type { ActionValuation, RecoveryAction } from "@/types";

/**
 * The candidate actions the policy engine valued, and the one it chose.
 *
 * Rendered straight from `candidate_valuations` on the decision response. The
 * previous version took a locally-defined shape carrying `friction_penalty_paise`,
 * `is_permitted_by_bounds` and `rejection_reason` -- fields the policy engine
 * does not return -- and displayed a hardcoded "Optimal Decision: SWITCH_RAIL"
 * badge regardless of what was actually chosen.
 *
 * Bounds status is deliberately not shown here. The bounds engine runs in
 * salvage-core, after the policy engine has ranked actions, and its verdict is
 * recorded on the decision row rather than on a valuation. Showing a
 * per-action permitted/refused column would be inventing a verdict per row.
 */
export function ActionRankingTable({
  actions,
  chosenAction,
}: {
  actions: ActionValuation[];
  chosenAction: RecoveryAction;
}): React.ReactElement {
  const ranked = [...actions].sort(
    (a, b) => b.net_expected_value_paise - a.net_expected_value_paise,
  );

  return (
    <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 text-center flex flex-col items-center">
      <div className="flex flex-col items-center justify-center mb-6 space-y-1">
        <h3 className="text-base sm:text-lg font-serif font-bold text-slate-900 flex items-center justify-center gap-2">
          <Award className="w-4 h-4 text-emerald-600" />
          Expected Net Value by Action
        </h3>
        <p className="text-xs text-slate-500 max-w-lg font-sans">
          net = P(recovery) × amount − cost. The policy engine ranks every action it is allowed
          to take and picks the highest.
        </p>
        <div className="pt-2">
          <span className="text-[11px] font-mono px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold shadow-sm inline-flex items-center gap-1.5">
            <Check className="w-3 h-3 text-emerald-600" />
            Chosen: {chosenAction}
          </span>
        </div>
      </div>

      {ranked.length === 0 ? (
        <p className="text-xs text-slate-500 py-6">
          The decision recorded no candidate valuations.
        </p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full text-center border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider">
                <th className="pb-3 px-3 font-semibold text-center">Action</th>
                <th className="pb-3 px-3 font-semibold text-center">P(recovery)</th>
                <th className="pb-3 px-3 font-semibold text-center">Gross</th>
                <th className="pb-3 px-3 font-semibold text-center">Cost</th>
                <th className="pb-3 px-3 font-semibold text-center">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ranked.map((valuation) => {
                const chosen = valuation.action === chosenAction;
                return (
                  <tr
                    key={valuation.action}
                    className={chosen ? "bg-emerald-50/60" : "hover:bg-slate-50/60"}
                  >
                    <td className="py-3 px-3 font-bold text-slate-800">
                      <span className="inline-flex items-center gap-1.5">
                        {chosen && <Check className="w-3 h-3 text-emerald-600" />}
                        {valuation.action}
                      </span>
                    </td>
                    <td className="py-3 px-3 tabular-nums text-slate-700">
                      {formatPercent(valuation.recovery_probability)}
                    </td>
                    <td className="py-3 px-3 tabular-nums text-slate-600">
                      {formatRupeesDetailed(valuation.gross_expected_value_paise)}
                    </td>
                    <td className="py-3 px-3 tabular-nums text-slate-600">
                      {formatRupeesDetailed(valuation.estimated_cost_paise)}
                    </td>
                    <td
                      className={`py-3 px-3 tabular-nums font-bold ${
                        valuation.net_expected_value_paise >= 0
                          ? "text-emerald-700"
                          : "text-rose-700"
                      }`}
                    >
                      {formatRupeesDetailed(valuation.net_expected_value_paise)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
