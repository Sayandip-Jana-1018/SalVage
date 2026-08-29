"use client";

import { ArrowRight, Layers, ShieldCheck, Zap } from "lucide-react";
import React from "react";
import { formatPercent, getHealthColorClass } from "@/lib/formatters";
import { initialRailGrid } from "@/lib/mockData";
import { RailHealthCell } from "@/types";

export function RailHealthMatrix(): React.ReactElement {
  const banks = ["HDFC Bank", "State Bank of India", "ICICI Bank", "Axis Bank"];
  const methods = ["UPI", "CARD", "NETBANKING"] as const;

  const getCell = (
    bank: string,
    method: "UPI" | "CARD" | "NETBANKING"
  ): RailHealthCell | undefined => {
    return initialRailGrid.find((c) => c.bank === bank && c.method === method);
  };

  return (
    <div className="w-full rounded-2xl liquid-glass p-5 sm:p-6 shadow-2xl border border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-sm sm:text-base font-serif font-bold text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            2D Multi-Tenant Rail Sensing Matrix
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Sliding-window failure sensing aggregated across all connected merchant streams
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/20 text-emerald-300 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Healthy (&lt;3%)</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-950/40 border border-amber-500/20 text-amber-300 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Degraded (3-20%)</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-950/40 border border-rose-500/20 text-rose-300 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            <span>Down (&gt;20%)</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/5 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              <th className="pb-3 pr-4 font-normal">Issuer Bank</th>
              {methods.map((m) => (
                <th key={m} className="pb-3 px-4 font-normal text-center">
                  {m} Rail
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono text-xs">
            {banks.map((bank) => (
              <tr key={bank} className="hover:bg-white/[0.02] transition-colors">
                <td className="py-4 pr-4 font-sans font-semibold text-slate-200 text-xs sm:text-sm">
                  {bank}
                </td>
                {methods.map((method) => {
                  const cell = getCell(bank, method);
                  if (!cell)
                    return (
                      <td key={method} className="py-3.5 px-4 text-slate-600 text-center">
                        -
                      </td>
                    );

                  const color = getHealthColorClass(cell.state);

                  return (
                    <td key={method} className="py-2.5 px-2">
                      <div
                        className={`rounded-xl border p-3 flex flex-col gap-1.5 transition-all duration-300 backdrop-blur-md ${color.bg} ${color.border} hover:scale-[1.02] hover:shadow-lg`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${color.dot} ${
                                cell.state === "DOWN" ? "animate-ping" : ""
                              }`}
                            />
                            <span className={`text-[11px] font-bold ${color.text}`}>
                              {cell.state}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 tabular-nums font-mono">
                            {cell.p95_latency_ms}ms p95
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-300">
                          <span className="text-slate-500">5m error:</span>
                          <span className="font-bold tabular-nums">
                            {formatPercent(cell.error_rate_5m)}
                          </span>
                        </div>

                        {cell.healthy_alternative && (
                          <div className="mt-1 pt-1 border-t border-white/10 flex items-center gap-1 text-[10px] text-cyan-300 font-mono">
                            <ArrowRight className="w-2.5 h-2.5 text-cyan-400" />
                            <span className="truncate">
                              Auto-Failover: {cell.healthy_alternative.split("|")[0]}
                            </span>
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
