"use client";

import { CheckCircle, ExternalLink, Radio, XCircle } from "lucide-react";
import Link from "next/link";
import { formatISTTime, formatRupees } from "@/lib/formatters";
import { initialDecisionStream } from "@/lib/mockData";

export function LiveDecisionStream() {
  return (
    <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            Live Ingest & Decision Stream
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time feed of payment failures diagnosed, optimized, and bounded
          </p>
        </div>
        <span className="text-xs font-mono text-slate-500">Auto-refreshing (sub-100ms)</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider">
              <th className="pb-2.5 pr-4 font-normal">Time (IST)</th>
              <th className="pb-2.5 px-3 font-normal">Attempt ID</th>
              <th className="pb-2.5 px-3 font-normal">Merchant</th>
              <th className="pb-2.5 px-3 font-normal">Amount</th>
              <th className="pb-2.5 px-3 font-normal">Diagnosis</th>
              <th className="pb-2.5 px-3 font-normal">Chosen Action</th>
              <th className="pb-2.5 px-3 font-normal">Bounds</th>
              <th className="pb-2.5 pl-3 font-normal text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {initialDecisionStream.map((item) => (
              <tr key={item.id} className="hover:bg-slate-800/20 transition-colors">
                <td className="py-2.5 pr-4 text-slate-500 tabular-nums">
                  {formatISTTime(item.created_at)}
                </td>
                <td className="py-2.5 px-3 font-semibold text-slate-200">{item.id}</td>
                <td className="py-2.5 px-3 text-slate-400">{item.merchant_id}</td>
                <td className="py-2.5 px-3 text-slate-200 tabular-nums font-semibold">
                  {formatRupees(item.amount_paise)}
                </td>
                <td className="py-2.5 px-3">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-amber-300 border border-slate-700/50">
                    {item.taxonomy_code}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                      item.chosen_action === "SWITCH_RAIL"
                        ? "bg-indigo-950/60 text-indigo-300 border-indigo-800/50"
                        : item.chosen_action === "RETRY_SCHEDULED"
                        ? "bg-purple-950/60 text-purple-300 border-purple-800/50"
                        : item.chosen_action === "CUSTOMER_NUDGE"
                        ? "bg-sky-950/60 text-sky-300 border-sky-800/50"
                        : item.chosen_action === "RETRY_IMMEDIATE"
                        ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/50"
                        : "bg-slate-900 text-slate-400 border-slate-800"
                    }`}
                  >
                    {item.chosen_action}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  {item.bounds_status === "PERMITTED" ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                      <CheckCircle className="w-3 h-3" />
                      Permitted
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-rose-400 font-semibold">
                      <XCircle className="w-3 h-3" />
                      Rejected
                    </span>
                  )}
                </td>
                <td className="py-2.5 pl-3 text-right">
                  <Link
                    href={`/autopsy/${item.id}`}
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline"
                  >
                    <span>Autopsy</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
