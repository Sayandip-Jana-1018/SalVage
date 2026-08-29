"use client";

import { ArrowRight, Zap } from "lucide-react";
import { formatPercent, getHealthColorClass } from "@/lib/formatters";
import { initialRailGrid } from "@/lib/mockData";
import { RailHealthCell } from "@/types";

export function RailHealthMatrix() {
  const banks = ["HDFC Bank", "State Bank of India", "ICICI Bank", "Axis Bank"];
  const methods = ["UPI", "CARD", "NETBANKING"] as const;

  const getCell = (bank: string, method: "UPI" | "CARD" | "NETBANKING"): RailHealthCell | undefined => {
    return initialRailGrid.find((c) => c.bank === bank && c.method === method);
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            2D Multi-Tenant Rail Sensing Matrix
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Sliding-window failure sensing aggregated across all connected merchant streams
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Healthy (&lt;3%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Degraded (3-20%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>Down (&gt;20%)</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              <th className="pb-3 pr-4 font-normal">Issuer Bank</th>
              {methods.map((m) => (
                <th key={m} className="pb-3 px-4 font-normal text-center">
                  {m} Rail
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
            {banks.map((bank) => (
              <tr key={bank} className="hover:bg-slate-800/20 transition-colors">
                <td className="py-3.5 pr-4 font-sans font-medium text-slate-200">{bank}</td>
                {methods.map((method) => {
                  const cell = getCell(bank, method);
                  if (!cell) return <td key={method} className="py-3.5 px-4 text-slate-600 text-center">-</td>;

                  const color = getHealthColorClass(cell.state);

                  return (
                    <td key={method} className="py-2.5 px-2.5">
                      <div
                        className={`rounded-md border p-2.5 flex flex-col gap-1 transition-all ${color.bg} ${color.border}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                            <span className={`text-[11px] font-bold ${color.text}`}>{cell.state}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            {cell.p95_latency_ms}ms p95
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-300">
                          <span className="text-slate-500">5m err:</span>
                          <span className="font-semibold tabular-nums">{formatPercent(cell.error_rate_5m)}</span>
                        </div>

                        {cell.healthy_alternative && (
                          <div className="mt-1 pt-1 border-t border-slate-800/80 flex items-center gap-1 text-[10px] text-indigo-300">
                            <ArrowRight className="w-2.5 h-2.5 text-indigo-400" />
                            <span className="truncate">Reroute: {cell.healthy_alternative.split("|")[0]}</span>
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
