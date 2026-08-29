"use client";

import { ArrowRight, Search, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatISTTime, formatRupees } from "@/lib/formatters";
import { initialDecisionStream } from "@/lib/mockData";

export default function AutopsyIndexPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = initialDecisionStream.filter(
    (item) =>
      item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.merchant_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.taxonomy_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-emerald-400" />
              The Autopsy View — Causal Failure Dissections
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select a payment failure attempt to dissect diagnosis, utility calculus, bounds checks, and cryptographic hash-chain proof
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Payment Attempt ID, Merchant ID, or Failure Taxonomy..."
            className="w-full rounded-md border border-slate-800 bg-slate-900/80 pl-9 pr-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>
      </div>

      {/* Attempts List */}
      <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm">
        <h3 className="text-xs font-mono uppercase text-slate-400 mb-3 tracking-wider">
          Recent Payment Failure Episodes ({filtered.length})
        </h3>

        <div className="divide-y divide-slate-800/60 font-mono text-xs">
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={`/autopsy/${item.id}`}
              className="py-3 px-2 flex items-center justify-between hover:bg-slate-800/30 rounded transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-200 group-hover:text-emerald-300">
                    {item.id}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {formatISTTime(item.created_at)} · {item.merchant_id}
                  </span>
                </div>

                <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-amber-300 border border-slate-700">
                  {item.taxonomy_code}
                </span>

                <span className="text-slate-300 font-semibold">{formatRupees(item.amount_paise)}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-950/60 text-indigo-300 border border-indigo-800/50">
                  {item.chosen_action}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
