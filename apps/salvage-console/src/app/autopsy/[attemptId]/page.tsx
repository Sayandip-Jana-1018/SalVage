"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Shield,
  Stethoscope,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import React from "react";
import { ActionRankingTable } from "@/components/ActionRankingTable";
import { HashChainVerifier } from "@/components/HashChainVerifier";
import { formatISTTime, formatPercent, formatRupees } from "@/lib/formatters";
import { sampleAutopsyDetail } from "@/lib/mockData";

export default function AutopsyDetailPage(): React.ReactElement {
  const params = useParams();
  const attemptId = (params?.attemptId as string) || "att_live_9482";
  const autopsy = sampleAutopsyDetail;

  return (
    <div className="w-full space-y-6">
      {/* Back button */}
      <Link
        href="/autopsy"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors font-mono font-medium"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Autopsy Explorer</span>
      </Link>

      {/* Header Summary */}
      <div className="w-full rounded-2xl liquid-glass p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-sm">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 font-mono">{attemptId}</h1>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                  {autopsy.merchant_id}
                </span>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                  RECOVERED VIA {autopsy.actions_evaluated.find((a) => a.is_chosen)?.action}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 font-mono">
                Failed at {formatISTTime(autopsy.created_at)} (IST) · Amount:{" "}
                <strong className="text-slate-800">{formatRupees(autopsy.amount_paise)}</strong> · Rail:{" "}
                <code className="text-slate-700 font-bold">{autopsy.rail_id}</code>
              </p>
            </div>
          </div>

          <div className="text-right font-mono text-xs">
            <span className="text-slate-400 block text-[10px] uppercase font-sans font-medium">Net Value Salvaged</span>
            <span className="text-xl font-bold text-emerald-700">
              {formatRupees(157250)}
            </span>
          </div>
        </div>
      </div>

      {/* 2-Column Section: Diagnostic & Context */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ingested Raw Error vs Normalized Diagnosis */}
        <div className="rounded-2xl liquid-glass p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 font-mono text-xs">
          <h3 className="text-sm font-serif font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Diagnostic Taxonomy & Rail State
          </h3>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-500 block text-[10px] uppercase font-sans font-medium">Raw Provider Error</span>
              <span className="text-rose-700 font-bold block mt-0.5">
                {autopsy.raw_error_code} — {autopsy.raw_error_message}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
              <span className="text-emerald-800 block text-[10px] uppercase font-sans font-medium">Normalized Causal Taxonomy</span>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-emerald-900 font-bold text-sm">
                  {autopsy.taxonomy_code}
                </span>
                <span className="text-emerald-800 font-semibold text-[11px]">
                  Confidence: {formatPercent(autopsy.taxonomy_confidence)}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 font-sans text-xs">
                <Users className="w-4 h-4 text-indigo-600" />
                <span className="text-slate-700 font-medium">Cross-Tenant Corroboration</span>
              </div>
              <span className="text-slate-900 font-bold font-mono">
                {autopsy.corroborating_merchants_count} Merchants
              </span>
            </div>
          </div>
        </div>

        {/* Safety Bounds & Deterministic Limits Checklist */}
        <div className="rounded-2xl liquid-glass p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 font-mono text-xs">
          <h3 className="text-sm font-serif font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" />
            Hard Safety Bounds Checklist (In Code)
          </h3>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-700">Quiet Hours Guard (22:00-08:00 IST)</span>
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Permitted
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-700">Attempt Cap Guard (&le; 3 attempts)</span>
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Attempt 1/3 (OK)
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-700">Customer Opt-Out Registry Check</span>
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Consented
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-700">Per-Customer Distributed Lock</span>
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Acquired (0 race)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Expected Net Utility 5-Action Ranking Table */}
      <ActionRankingTable actions={autopsy.actions_evaluated} />

      {/* 4. Cryptographic Hash-Chain Ledger Verification */}
      <HashChainVerifier
        entryIndex={autopsy.ledger_proof.entry_index}
        entryHash={autopsy.ledger_proof.entry_hash}
        previousHash={autopsy.ledger_proof.previous_hash}
      />
    </div>
  );
}
