"use client";

import { AlertOctagon, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import React from "react";
import { useApi } from "@/lib/useApi";
import type { ChainVerification, LedgerEntryView } from "@/types";

interface LedgerPayload {
  verification: ChainVerification;
  entries: LedgerEntryView[];
}

/**
 * Verify a merchant's ledger chain, for real.
 *
 * The button here used to be theatre: clicking it set a flag, waited 600ms on
 * a `setTimeout`, and then displayed "verified" unconditionally. It never
 * contacted anything, could not fail, and sat directly beneath a heading
 * claiming to prove tamper-evidence. A control that always reports success is
 * worse than no control, because it converts an unchecked assumption into
 * displayed evidence.
 *
 * It now calls `GET /api/v1/ledger/merchants/{id}/verify`, which rewalks the
 * whole chain server-side, recomputes every hash from the stored content, and
 * reports the first entry that does not match. A broken chain renders as
 * broken.
 */
export function HashChainVerifier({
  merchantId,
  highlightAttemptId,
}: {
  merchantId: string;
  highlightAttemptId?: string;
}): React.ReactElement {
  const { phase, data, error, refresh } = useApi<LedgerPayload>(
    `/api/ledger/${encodeURIComponent(merchantId)}?limit=5`,
  );

  const verification = data?.verification;
  const verifying = phase === "loading";

  return (
    <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 text-center flex flex-col items-center">
      <div className="flex flex-col items-center justify-center mb-5 space-y-1">
        <h3 className="text-base sm:text-lg font-serif font-bold text-slate-900 flex items-center justify-center gap-2">
          <Lock className="w-4 h-4 text-emerald-600" />
          Hash Chain Verification
        </h3>
        <p className="text-xs text-slate-500 max-w-lg font-sans">
          Each entry stores <span className="font-mono">SHA-256(prev_hash ‖ index ‖ merchant ‖ entity ‖ event ‖ payload ‖ timestamp)</span>.
          Verification recomputes every hash from stored content and re-links the chain.
        </p>

        <div className="pt-2">
          <button
            onClick={refresh}
            disabled={verifying}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-mono font-semibold inline-flex items-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${verifying ? "animate-spin" : ""}`} />
            <span>{verifying ? "Walking chain…" : "Verify chain now"}</span>
          </button>
        </div>
      </div>

      {phase === "unavailable" && (
        <div className="w-full max-w-2xl p-5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 font-mono">
          Could not verify: {error}
          <p className="mt-1 font-sans text-[11px] text-slate-600">
            This is not a verification failure. The chain was not checked at all.
          </p>
        </div>
      )}

      {verification && (
        <div className="w-full max-w-2xl p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4 font-mono text-xs flex flex-col items-center">
          {verification.valid ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 text-emerald-800 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>CHAIN INTACT</span>
              </div>
              <span className="text-[11px] text-slate-600">
                {verification.verified_entries} entr
                {verification.verified_entries === 1 ? "y" : "ies"} recomputed and re-linked
              </span>
              {verification.verified_entries === 0 && (
                <span className="text-[11px] text-amber-700 font-sans max-w-md">
                  The chain is empty. An empty chain verifies trivially, which is not evidence
                  that anything was recorded.
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 text-rose-800 font-bold">
                <AlertOctagon className="w-4 h-4" />
                <span>CHAIN BROKEN</span>
              </div>
              <span className="text-[11px] text-rose-700">
                First bad entry: #{verification.failure_index}
              </span>
              <span className="text-[11px] text-slate-600 font-sans max-w-md">
                {verification.failure_reason}
              </span>
            </div>
          )}

          {verification.head_hash && (
            <div className="w-full pt-3 border-t border-slate-200/70 text-center">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">
                Chain head
              </span>
              <span className="text-slate-600 text-[11px] break-all select-all block mt-0.5">
                {verification.head_hash}
              </span>
            </div>
          )}

          {data && data.entries.length > 0 && (
            <div className="w-full pt-3 border-t border-slate-200/70 space-y-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">
                Most recent entries
              </span>
              {data.entries.map((entry) => {
                const related =
                  highlightAttemptId !== undefined &&
                  entry.payload.includes(highlightAttemptId);
                return (
                  <div
                    key={entry.entry_hash}
                    className={`text-left px-3 py-2 rounded-lg border text-[11px] ${
                      related
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">
                        #{entry.entry_index} {entry.event_type}
                      </span>
                      {related && (
                        <span className="text-[9px] font-bold text-emerald-700 uppercase">
                          this attempt
                        </span>
                      )}
                    </div>
                    <div className="text-slate-500 break-all mt-0.5">{entry.entry_hash}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
