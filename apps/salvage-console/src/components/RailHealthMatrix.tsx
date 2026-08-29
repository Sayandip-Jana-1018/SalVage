"use client";

import { ArrowRight, Layers, ShieldCheck, Zap } from "lucide-react";
import React from "react";
import { formatPercent } from "@/lib/formatters";
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

  const getLightHealthStyle = (state: string) => {
    switch (state) {
      case "HEALTHY":
        return {
          bg: "bg-emerald-50/70",
          border: "border-emerald-200/80",
          text: "text-emerald-800",
          dot: "bg-emerald-500",
        };
      case "DEGRADED":
        return {
          bg: "bg-amber-50/70",
          border: "border-amber-200/80",
          text: "text-amber-800",
          dot: "bg-amber-500",
        };
      case "DOWN":
        return {
          bg: "bg-rose-50/70",
          border: "border-rose-200/80",
          text: "text-rose-800",
          dot: "bg-rose-500",
        };
      default:
        return {
          bg: "bg-slate-50",
          border: "border-slate-200",
          text: "text-slate-700",
          dot: "bg-slate-400",
        };
    }
  };

  return (
    <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 text-center flex flex-col items-center">
      {/* Centered Title & Subtitle */}
      <div className="flex flex-col items-center justify-center mb-6 space-y-1">
        <h2 className="text-base sm:text-lg font-serif font-bold text-slate-900 flex items-center justify-center gap-2">
          <Zap className="w-4 h-4 text-emerald-600" />
          2D Multi-Tenant Rail Sensing Matrix
        </h2>
        <p className="text-xs text-slate-500 max-w-lg">
          Sliding-window failure sensing aggregated across all connected merchant streams
        </p>

        {/* Centered Status Legend Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Healthy (&lt;3%)</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>Degraded (3-20%)</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-[10px] font-semibold shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            <span>Down (&gt;20%)</span>
          </div>
        </div>
      </div>

      {/* Centered Table Grid */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-center border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] font-mono text-slate-500 uppercase tracking-wider">
              <th className="pb-3 px-4 font-semibold text-center w-1/4">Issuer Bank</th>
              {methods.map((m) => (
                <th key={m} className="pb-3 px-4 font-semibold text-center w-1/4">
                  {m} Rail
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-xs">
            {banks.map((bank) => (
              <tr key={bank} className="hover:bg-slate-50/60 transition-colors">
                <td className="py-4 px-4 font-sans font-bold text-slate-900 text-xs sm:text-sm text-center">
                  {bank}
                </td>
                {methods.map((method) => {
                  const cell = getCell(bank, method);
                  if (!cell)
                    return (
                      <td key={method} className="py-3.5 px-4 text-slate-400 text-center">
                        -
                      </td>
                    );

                  const color = getLightHealthStyle(cell.state);

                  return (
                    <td key={method} className="py-2.5 px-2">
                      <div
                        className={`rounded-2xl border p-3.5 flex flex-col items-center justify-center gap-1.5 transition-all duration-300 ${color.bg} ${color.border} hover:shadow-md hover:scale-[1.02] text-center`}
                      >
                        <div className="flex items-center justify-center gap-2 w-full">
                          <span
                            className={`w-2 h-2 rounded-full ${color.dot} ${
                              cell.state === "DOWN" ? "animate-ping" : ""
                            }`}
                          />
                          <span className={`text-[11px] font-bold ${color.text}`}>
                            {cell.state}
                          </span>
                          <span className="text-[10px] text-slate-400 tabular-nums font-mono">
                            · {cell.p95_latency_ms}ms p95
                          </span>
                        </div>

                        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-700">
                          <span className="text-slate-500">5m error:</span>
                          <span className="font-bold tabular-nums">
                            {formatPercent(cell.error_rate_5m)}
                          </span>
                        </div>

                        {cell.healthy_alternative && (
                          <div className="mt-1 pt-1 border-t border-slate-200/60 flex items-center justify-center gap-1 text-[10px] text-indigo-700 font-mono font-medium">
                            <ArrowRight className="w-2.5 h-2.5 text-indigo-600" />
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
