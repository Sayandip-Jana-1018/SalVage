"use client";

import { Radio, ShieldCheck } from "lucide-react";
import React from "react";
import { StaleBanner, StateNotice } from "@/components/StateNotice";
import { formatISTTime } from "@/lib/formatters";
import { useMerchant } from "@/lib/merchant";
import { useApi } from "@/lib/useApi";
import type { ChainVerification, LedgerEntryView } from "@/types";

const POLL_MS = 5000;

interface LedgerPayload {
  verification: ChainVerification;
  entries: LedgerEntryView[];
}

/**
 * The ledger, tailed live. This is the decision stream.
 *
 * Every recovery decision and saga transition is appended to the hash-chained
 * ledger inside the same transaction that records it, so the ledger *is* the
 * authoritative stream of what the system did. Reading it here rather than
 * keeping a separate feed means the operator sees exactly the rows an auditor
 * would, and the chain verdict is displayed alongside them.
 *
 * The version this replaces mapped over a checked-in array and advertised
 * "Auto-refreshing (<50ms SLA)" -- a latency claim about a system that was not
 * being contacted.
 */
export function LiveDecisionStream(): React.ReactElement {
  const { merchantId, ready } = useMerchant();
  const { phase, data, error, lastUpdated } = useApi<LedgerPayload>(
    ready ? `/api/ledger/${encodeURIComponent(merchantId)}?limit=25` : null,
    POLL_MS,
  );

  return (
    <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 text-center flex flex-col items-center">
      <div className="flex flex-col items-center justify-center mb-6 space-y-1">
        <h2 className="text-base sm:text-lg font-serif font-bold text-slate-900 flex items-center justify-center gap-2">
          <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
          Ledger Stream
        </h2>
        <p className="text-xs text-slate-500 max-w-lg">
          Every decision and saga transition, appended to the tamper-evident chain for{" "}
          <span className="font-mono text-slate-700">{merchantId}</span>
        </p>

        {data && <ChainBadge verification={data.verification} />}

        {lastUpdated && (
          <p className="text-[10px] font-mono text-slate-400 pt-1">
            Refreshed {formatISTTime(lastUpdated.toISOString())} IST
          </p>
        )}
      </div>

      {phase !== "ready" && !data ? (
        <StateNotice
          phase={phase}
          error={error}
          emptyTitle="No ledger entries"
          emptyBody="Nothing has been appended for this merchant yet. Entries appear as soon as the policy engine records a decision."
        />
      ) : (
        <div className="w-full">
          {phase === "unavailable" && error && <StaleBanner error={error} />}
          {data && data.entries.length === 0 ? (
            <StateNotice
              phase="missing"
              emptyTitle="Ledger is empty"
              emptyBody="salvage-core answered and this merchant has no ledger entries. An empty chain verifies trivially; it is not evidence that anything was recorded."
            />
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 px-3 font-semibold">#</th>
                    <th className="pb-3 px-3 font-semibold">Event</th>
                    <th className="pb-3 px-3 font-semibold">Entity</th>
                    <th className="pb-3 px-3 font-semibold">Recorded</th>
                    <th className="pb-3 px-3 font-semibold">Entry hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                  {data?.entries.map((entry) => (
                    <tr key={entry.entry_hash} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3 tabular-nums text-slate-500">{entry.entry_index}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700">
                          {entry.event_type}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 truncate max-w-[12rem]">
                        {entry.entity_type}
                      </td>
                      <td className="py-3 px-3 text-slate-500 tabular-nums">
                        {formatISTTime(entry.created_at)}
                      </td>
                      <td
                        className="py-3 px-3 text-slate-400 truncate max-w-[10rem]"
                        title={entry.entry_hash}
                      >
                        {entry.entry_hash.slice(0, 16)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChainBadge({ verification }: { verification: ChainVerification }): React.ReactElement {
  if (!verification.valid) {
    return (
      <span className="text-xs font-mono text-rose-900 bg-rose-50 px-3 py-1 rounded-full border border-rose-300 inline-flex items-center gap-1.5 font-semibold shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
        CHAIN BROKEN at entry #{verification.failure_index}
      </span>
    );
  }
  return (
    <span className="text-xs font-mono text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 inline-flex items-center gap-1.5 font-semibold shadow-sm">
      <ShieldCheck className="w-3 h-3" />
      {verification.verified_entries} entries verified server-side
    </span>
  );
}
