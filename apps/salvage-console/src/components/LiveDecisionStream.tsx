"use client";

import {
  ArrowRight,
  CheckCircle,
  ExternalLink,
  Radio,
  Sparkles,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { formatISTTime, formatRupees } from "@/lib/formatters";
import { initialDecisionStream } from "@/lib/mockData";

export function LiveDecisionStream(): React.ReactElement {
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="w-full rounded-2xl liquid-glass p-5 sm:p-6 shadow-2xl border border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-sm sm:text-base font-serif font-bold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            Live Ingest & Decision Stream
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time feed of payment failures diagnosed, optimized, and bounded
          </p>
        </div>
        <span className="text-xs font-mono text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          Auto-refreshing (&lt;50ms)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-white/5 text-[11px] text-slate-400 uppercase tracking-wider">
              <th className="pb-3 pr-4 font-normal">Time (IST)</th>
              <th className="pb-3 px-3 font-normal">Attempt ID</th>
              <th className="pb-3 px-3 font-normal">Merchant</th>
              <th className="pb-3 px-3 font-normal">Amount</th>
              <th className="pb-3 px-3 font-normal">Diagnosis</th>
              <th className="pb-3 px-3 font-normal">Chosen Action</th>
              <th className="pb-3 px-3 font-normal">Bounds</th>
              <th className="pb-3 pl-3 font-normal text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {initialDecisionStream.map((item) => (
              <tr
                key={item.id}
                className="hover:bg-white/[0.02] transition-colors group"
              >
                <td
                  suppressHydrationWarning
                  className="py-3.5 pr-4 text-slate-400 tabular-nums"
                >
                  {mounted ? formatISTTime(item.created_at) : "14:02:11"}
                </td>
                <td className="py-3.5 px-3 font-bold text-slate-200 group-hover:text-emerald-300 transition-colors">
                  {item.id}
                </td>
                <td className="py-3.5 px-3 text-slate-400">{item.merchant_id}</td>
                <td className="py-3.5 px-3 text-white tabular-nums font-bold">
                  {formatRupees(item.amount_paise)}
                </td>
                <td className="py-3.5 px-3">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-950/40 text-amber-300 border border-amber-500/30">
                    {item.taxonomy_code}
                  </span>
                </td>
                <td className="py-3.5 px-3">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                      item.chosen_action === "SWITCH_RAIL"
                        ? "bg-indigo-950/50 text-indigo-300 border-indigo-500/40"
                        : item.chosen_action === "RETRY_SCHEDULED"
                        ? "bg-purple-950/50 text-purple-300 border-purple-500/40"
                        : item.chosen_action === "CUSTOMER_NUDGE"
                        ? "bg-sky-950/50 text-sky-300 border-sky-500/40"
                        : item.chosen_action === "RETRY_IMMEDIATE"
                        ? "bg-emerald-950/50 text-emerald-300 border-emerald-500/40"
                        : "bg-slate-900 text-slate-400 border-white/10"
                    }`}
                  >
                    {item.chosen_action}
                  </span>
                </td>
                <td className="py-3.5 px-3">
                  {item.bounds_status === "PERMITTED" ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Permitted
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-rose-400 font-semibold">
                      <XCircle className="w-3.5 h-3.5" />
                      Rejected
                    </span>
                  )}
                </td>
                <td className="py-3.5 pl-3 text-right">
                  <Link
                    href={`/autopsy/${item.id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded-md hover:bg-emerald-950/30 border border-transparent hover:border-emerald-500/30 transition-all"
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
