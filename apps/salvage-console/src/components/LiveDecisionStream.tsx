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
    <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 text-center flex flex-col items-center">
      {/* Centered Title & Subtitle */}
      <div className="flex flex-col items-center justify-center mb-6 space-y-1">
        <h2 className="text-base sm:text-lg font-serif font-bold text-slate-900 flex items-center justify-center gap-2">
          <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
          Live Ingest & Decision Stream
        </h2>
        <p className="text-xs text-slate-500 max-w-lg">
          Real-time feed of payment failures diagnosed, optimized, and bounded
        </p>
        <div className="pt-2">
          <span className="text-xs font-mono text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 inline-flex items-center gap-1.5 font-semibold shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            Auto-refreshing (&lt;50ms SLA)
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full text-center border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] text-slate-500 uppercase tracking-wider">
              <th className="pb-3 px-3 font-semibold text-center">Time (IST)</th>
              <th className="pb-3 px-3 font-semibold text-center">Attempt ID</th>
              <th className="pb-3 px-3 font-semibold text-center">Merchant</th>
              <th className="pb-3 px-3 font-semibold text-center">Amount</th>
              <th className="pb-3 px-3 font-semibold text-center">Diagnosis</th>
              <th className="pb-3 px-3 font-semibold text-center">Chosen Action</th>
              <th className="pb-3 px-3 font-semibold text-center">Bounds</th>
              <th className="pb-3 px-3 font-semibold text-center">Action</th>
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
                  className="py-3.5 px-3 text-slate-500 tabular-nums text-center"
                >
                  {mounted ? formatISTTime(item.created_at) : "14:02:11"}
                </td>
                <td className="py-3.5 px-3 font-bold text-slate-800 group-hover:text-emerald-700 transition-colors text-center">
                  {item.id}
                </td>
                <td className="py-3.5 px-3 text-slate-600 text-center">{item.merchant_id}</td>
                <td className="py-3.5 px-3 text-slate-900 tabular-nums font-bold text-center">
                  {formatRupees(item.amount_paise)}
                </td>
                <td className="py-3.5 px-3 text-center">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    {item.taxonomy_code}
                  </span>
                </td>
                <td className="py-3.5 px-3 text-center">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
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
                <td className="py-3.5 px-3 text-center">
                  {item.bounds_status === "PERMITTED" ? (
                    <span className="inline-flex items-center justify-center gap-1 text-[11px] text-emerald-700 font-semibold">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      Permitted
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-1 text-[11px] text-rose-700 font-semibold">
                      <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      Rejected
                    </span>
                  )}
                </td>
                <td className="py-3.5 px-3 text-center">
                  <Link
                    href={`/autopsy/${item.id}`}
                    className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 px-2.5 py-1 rounded-lg hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-all"
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
