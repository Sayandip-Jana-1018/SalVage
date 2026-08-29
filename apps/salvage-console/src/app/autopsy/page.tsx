"use client";

import { ArrowRight, Search, Stethoscope } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { formatISTTime, formatRupees } from "@/lib/formatters";
import { initialDecisionStream } from "@/lib/mockData";

export default function AutopsyIndexPage(): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = initialDecisionStream.filter(
    (item) =>
      item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.merchant_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.taxonomy_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full space-y-6 flex flex-col items-center text-center">
      {/* Header */}
      <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 flex flex-col items-center text-center">
        <div className="flex flex-col items-center justify-center mb-4 space-y-1">
          <h2 className="text-base sm:text-lg font-serif font-bold text-slate-900 flex items-center justify-center gap-2">
            <Stethoscope className="w-4 h-4 text-emerald-600" />
            The Autopsy View — Causal Failure Dissections
          </h2>
          <p className="text-xs text-slate-500 max-w-lg">
            Select a payment failure attempt to dissect diagnosis, utility calculus, bounds checks, and cryptographic hash-chain proof
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full max-w-2xl mx-auto">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Payment Attempt ID, Merchant ID, or Failure Taxonomy..."
            className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono shadow-sm text-center"
          />
        </div>
      </div>

      {/* Attempts List */}
      <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 flex flex-col items-center text-center">
        <h3 className="text-xs font-mono uppercase text-slate-500 mb-5 tracking-wider font-semibold">
          Recent Payment Failure Episodes ({filtered.length})
        </h3>

        <div className="w-full divide-y divide-slate-100 font-mono text-xs">
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={`/autopsy/${item.id}`}
              className="py-4 px-3 flex flex-wrap items-center justify-between hover:bg-slate-50 rounded-xl transition-all group gap-3"
            >
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex flex-col text-left">
                  <span className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                    {item.id}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {formatISTTime(item.created_at)} · {item.merchant_id}
                  </span>
                </div>

                <span className="px-2.5 py-0.5 rounded-lg text-[10px] bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                  {item.taxonomy_code}
                </span>

                <span className="text-slate-900 font-bold">{formatRupees(item.amount_paise)}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-2.5 py-0.5 rounded-lg text-[10px] bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold">
                  {item.chosen_action}
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
