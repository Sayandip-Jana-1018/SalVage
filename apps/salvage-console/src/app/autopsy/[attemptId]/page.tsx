"use client";

import { ArrowLeft, FileSearch } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React from "react";
import { ActionRankingTable } from "@/components/ActionRankingTable";
import { HashChainVerifier } from "@/components/HashChainVerifier";
import { StateNotice } from "@/components/StateNotice";
import { formatISTTime, formatPercent, formatRupeesDetailed } from "@/lib/formatters";
import { DEFAULT_MERCHANT_ID } from "@/lib/merchant";
import { useApi } from "@/lib/useApi";
import type { AutopsyView } from "@/types";

/**
 * Everything the system knows about one attempt.
 *
 * Each panel below renders only if the corresponding service returned
 * something. Where there is no diagnosis or no decision, the page says so
 * rather than filling the gap. The previous version read a single checked-in
 * fixture and always displayed a complete, confident autopsy -- including a
 * cross-tenant corroboration count, a bounds verdict with named guards, and a
 * ledger proof with a merkle root that no part of the system computes.
 */
export default function AutopsyDetailPage(): React.ReactElement {
  const params = useParams<{ attemptId: string }>();
  const search = useSearchParams();
  const attemptId = decodeURIComponent(params.attemptId);
  const merchantId = search.get("merchant") ?? DEFAULT_MERCHANT_ID;

  const { phase, data, error } = useApi<AutopsyView>(
    `/api/autopsy/${encodeURIComponent(merchantId)}/${encodeURIComponent(attemptId)}`,
  );

  return (
    <div className="w-full flex flex-col items-center space-y-6">
      <div className="w-full flex items-center justify-center">
        <Link
          href="/autopsy"
          className="text-xs font-mono text-slate-500 hover:text-emerald-700 inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to lookup
        </Link>
      </div>

      {phase !== "ready" || !data ? (
        <div className="w-full rounded-2xl liquid-glass p-8 border border-slate-200/90">
          <StateNotice
            phase={phase === "ready" ? "missing" : phase}
            error={error}
            emptyTitle="No such payment attempt"
            emptyBody={`salvage-brain has no attempt ${attemptId} for merchant ${merchantId}. Nothing can be reconstructed about an attempt that was never ingested.`}
          />
        </div>
      ) : (
        <>
          <IngestPanel view={data} merchantId={merchantId} />
          <DiagnosisPanel view={data} />
          {data.decision ? (
            <ActionRankingTable
              actions={data.decision.candidate_valuations}
              chosenAction={data.decision.chosen_action}
            />
          ) : (
            <div className="w-full rounded-2xl liquid-glass p-8 border border-slate-200/90">
              <StateNotice
                phase="missing"
                emptyTitle="No policy decision"
                emptyBody="The policy engine has not recorded a decision for this attempt."
              />
            </div>
          )}
          <HashChainVerifier merchantId={merchantId} highlightAttemptId={attemptId} />
        </>
      )}
    </div>
  );
}

function IngestPanel({
  view,
  merchantId,
}: {
  view: AutopsyView;
  merchantId: string;
}): React.ReactElement {
  const { attempt } = view;
  return (
    <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 text-center flex flex-col items-center">
      <div className="flex flex-col items-center mb-5 space-y-1">
        <h1 className="text-base sm:text-lg font-serif font-bold text-slate-900 flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-emerald-600" />
          {attempt.payment_attempt_id}
        </h1>
        <p className="text-xs text-slate-500 font-mono">
          {merchantId} · order {attempt.order_id}
        </p>
      </div>

      <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
        <Field label="Amount" value={formatRupeesDetailed(attempt.amount_paise)} strong />
        <Field label="Method" value={attempt.payment_method} />
        <Field label="Issuer" value={attempt.issuer} />
        <Field label="Recurring" value={attempt.is_recurring ? "yes" : "no"} />
      </div>

      <div className="w-full mt-5 pt-4 border-t border-slate-100">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
          Failures recorded ({attempt.failures.length})
        </span>
        {attempt.failures.length === 0 ? (
          <p className="text-xs text-slate-500 mt-2">No failure events on this attempt.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {attempt.failures.map((failure) => (
              <div
                key={failure.event_id}
                className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono"
              >
                <span className="px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-800 font-bold">
                  {failure.provider_error_code}
                </span>
                <span className="text-slate-500">{failure.rail_id}</span>
                <span className="text-slate-400">{formatISTTime(failure.event_timestamp)}</span>
                <span className="text-slate-500">
                  taxonomy: {failure.taxonomy_code ?? "unclassified"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DiagnosisPanel({ view }: { view: AutopsyView }): React.ReactElement {
  if (!view.diagnosis) {
    return (
      <div className="w-full rounded-2xl liquid-glass p-8 border border-slate-200/90">
        <StateNotice
          phase="missing"
          emptyTitle="No diagnosis"
          emptyBody="The diagnosis engine has not classified this attempt."
        />
      </div>
    );
  }

  const d = view.diagnosis;
  return (
    <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 text-center flex flex-col items-center">
      <h3 className="text-base sm:text-lg font-serif font-bold text-slate-900 mb-4">Diagnosis</h3>

      <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
        <Field label="Taxonomy" value={d.taxonomy_code} strong />
        <Field label="Confidence" value={formatPercent(d.confidence)} />
        <Field label="Rail" value={d.rail_id} />
        <Field label="Rail state" value={d.rail_state} />
      </div>

      <p className="text-xs text-slate-600 mt-4 max-w-2xl font-sans">{d.root_cause}</p>

      {d.explainability_tokens.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3">
          {d.explainability_tokens.map((token) => (
            <span
              key={token}
              className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700"
            >
              {token}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center">
      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
        {label}
      </span>
      <span
        className={`mt-1 text-xs sm:text-sm truncate max-w-full ${
          strong ? "font-bold text-slate-900" : "text-slate-700"
        }`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
