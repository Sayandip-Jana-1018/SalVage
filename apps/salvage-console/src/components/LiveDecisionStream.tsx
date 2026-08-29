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
    <div className="w-full rounded-2xl liquid-glass p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-sm sm:text-base font-serif font-bold text-slate-900 flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
            Live Ingest & Decision Stream
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time feed of payment failures diagnosed, optimized, and bounded
          </p>
        </div>
        <span className="text-xs font-mono text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1.5 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          Auto-refreshing (&lt;50ms)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] text-slate-500 uppercase tracking-wider">
              <th className="pb-3 pr-4 font-semibold">Time (IST)</th>
              <th className="pb-3 px-3 font-semibold">Attempt ID</th>
              <th className="pb-3 px-3 font-semibold">Merchant</th>
              <th className="pb-3 px-3 font-semibold">Amount</th>
              <th className="pb-3 px-3 font-semibold">Diagnosis</th>
              <th className="pb-3 px-3 font-semibold">Chosen Action</th>
              <th className="pb-3 px-3 font-semibold">Bounds</th>
              <th className="pb-3 pl-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialDecisionStream.map((item) => (
              <tr
                key={item.id}
                className="hover:bg-slate-50 transition-colors group"
              >
                <td
                  suppressHydrationWarning
                  className="py-3.5 pr-4 text-slate-500 tabular-nums"
                >
                  {mounted ? formatISTTime(item.created_at) : "14:02:11"}
                </td>
                <td className="py-3.5 px-3 font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">
                  {item.id}
                </td>
                <td className="py-3.5 px-3 text-slate-600">{item.merchant_id}</td>
                <td className="py-3.5 px-3 text-slate-900 tabular-nums font-bold">
                  {formatRupees(item.amount_paise)}
                </td>
                <td className="py-3.5 px-3">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    {item.taxonomy_code}
                  </span>
                </td>
                <td className="py-3.5 px-3">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                      item.chosen_action === "SWITCH_RAIL"
                        ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                        : item.chosen_action === "RETRY_SCHEDULED"
                        ? "bg-purple-50 text-purple-800 border-purple-200"
                        : item.chosen_action === "CUSTOMER_NUDGE"
                        ? "bg-sky-50 text-sky-800 border-sky-200"
                        : item.chosen_action === "RETRY_IMMEDIATE"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-slate-100 text-slate-700 border-slate-200"
                    }`}
                  >
                    {item.chosen_action}
                  </span>
                </td>
                <td className="py-3.5 px-3">
                  {item.bounds_status === "PERMITTED" ? (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      Permitted
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-rose-700 font-semibold">
                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      Rejected
                    </span>
                  )}
                </td>
                <td className="py-3.5 pl-3 text-right">
                  <Link
                    href={`/autopsy/${item.id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 px-2 py-1 rounded-md hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-all"
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
