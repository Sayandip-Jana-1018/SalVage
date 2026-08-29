"use client";

import { ArrowLeft, CheckCircle2, Shield, Stethoscope, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ActionRankingTable } from "@/components/ActionRankingTable";
import { HashChainVerifier } from "@/components/HashChainVerifier";
import { formatISTTime, formatPercent, formatRupees } from "@/lib/formatters";
import { sampleAutopsyDetail } from "@/lib/mockData";

export default function AutopsyDetailPage() {
  const params = useParams();
  const attemptId = (params?.attemptId as string) || "att_live_9482";
  const autopsy = sampleAutopsyDetail;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        href="/autopsy"
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors font-mono"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Autopsy Explorer</span>
      </Link>

      {/* Header Summary */}
      <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-emerald-950/60 border border-emerald-700/60 flex items-center justify-center text-emerald-400">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-100 font-mono">{attemptId}</h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {autopsy.merchant_id}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  RECOVERED VIA {autopsy.actions_evaluated.find((a) => a.is_chosen)?.action}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                Failed at {formatISTTime(autopsy.created_at)} (IST) · Amount:{" "}
                <strong className="text-slate-200">{formatRupees(autopsy.amount_paise)}</strong> · Rail:{" "}
                <code className="text-slate-300">{autopsy.rail_id}</code>
              </p>
            </div>
          </div>

          <div className="text-right font-mono text-xs">
            <span className="text-slate-400 block text-[10px] uppercase">Net Value Salvaged</span>
            <span className="text-lg font-bold text-emerald-400">
              {formatRupees(157250)}
            </span>
          </div>
        </div>
      </div>

      {/* 2-Column Section: Diagnostic & Context */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ingested Raw Error vs Normalized Diagnosis */}
        <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm font-mono text-xs">
          <h3 className="text-sm font-semibold font-sans text-slate-100 mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Diagnostic Taxonomy & Rail State
          </h3>

          <div className="space-y-2.5">
            <div className="p-3 rounded bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">Raw Gateway Feedback</span>
              <div className="text-rose-400 font-bold mt-0.5">{autopsy.raw_error_code}</div>
              <div className="text-slate-300 text-[11px] mt-0.5">{autopsy.raw_error_message}</div>
            </div>

            <div className="p-3 rounded bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                Normalized Causal Taxonomy
              </span>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-amber-400 font-bold text-sm">{autopsy.taxonomy_code}</span>
                <span className="text-[10px] text-slate-400">
                  Confidence: {formatPercent(autopsy.taxonomy_confidence)}
                </span>
              </div>
            </div>

            <div className="p-3 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Users className="w-3 h-3 text-indigo-400" />
                Cross-Tenant Corroboration
              </span>
              <span className="text-indigo-300 font-bold">
                {autopsy.corroborating_merchants_count} Merchants Corroborating
              </span>
            </div>
          </div>
        </div>

        {/* Safety Bounds Gate Verification */}
        <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm font-mono text-xs">
          <h3 className="text-sm font-semibold font-sans text-slate-100 mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            Hard Safety Bounds Engine Checklist
          </h3>

          <div className="space-y-2.5">
            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-300">AttemptCapGuard</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Attempt {autopsy.bounds_evaluation.attempt_count} / {autopsy.bounds_evaluation.max_attempts}
              </span>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-300">QuietHoursGuard (22:00-08:00 IST)</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Permitted (14:30 IST)
              </span>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-300">CustomerOptOutRegistry</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Active / Not Opted Out
              </span>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-300">ContactBudgetGuard</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {autopsy.bounds_evaluation.contact_budget_remaining} Contacts Remaining
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Action Ranking Table */}
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
