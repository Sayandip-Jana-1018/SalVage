"use client";

import { AlertOctagon, RefreshCw, ShieldCheck } from "lucide-react";
import React from "react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Mono } from "@/components/ui/Primitives";
import { useApi } from "@/lib/useApi";
import type { ChainVerification, LedgerEntryView } from "@/types";

interface LedgerPayload {
  verification: ChainVerification;
  entries: LedgerEntryView[];
}

/**
 * Verify a merchant's ledger chain, for real.
 *
 * The button here used to be theatre: clicking it set a flag, waited 600ms on a
 * `setTimeout`, then displayed "verified" unconditionally. It contacted
 * nothing, could not fail, and sat directly beneath a heading claiming to prove
 * tamper-evidence. A control that always reports success is worse than no
 * control, because it converts an unchecked assumption into displayed evidence.
 *
 * It now calls `GET /api/v1/ledger/merchants/{id}/verify`, which rewalks the
 * chain server-side, recomputes every hash from the stored content and reports
 * the first entry that does not match. A broken chain renders as broken.
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
    <Panel>
      <PanelHeader
        align="left"
        eyebrow="Tamper evidence"
        title="Hash chain verification"
        note={
          <>
            Each entry stores{" "}
            <span className="font-mono text-fg-muted">
              SHA-256(prev_hash ‖ index ‖ merchant ‖ entity ‖ event ‖ payload ‖ timestamp)
            </span>
            . Verification recomputes every hash from stored content and re-links the chain.
          </>
        }
        right={
          <button
            type="button"
            onClick={refresh}
            disabled={verifying}
            className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] text-fg transition-colors hover:border-iris/40 hover:text-iris disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${verifying ? "animate-spin" : ""}`} />
            {verifying ? "walking chain" : "verify now"}
          </button>
        }
      />

      <PanelBody className="space-y-4">
        {phase === "unavailable" ? (
          <div className="state-down state-tile rounded-xl p-4">
            <p className="font-mono text-xs text-down">Could not verify: {error}</p>
            <p className="mt-1.5 text-[11px] text-fg-muted">
              This is not a verification failure. The chain was not checked at all.
            </p>
          </div>
        ) : null}

        {verification ? (
          <>
            {verification.valid ? (
              <div className="state-healthy state-tile rounded-xl p-4">
                <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-healthy">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  chain intact
                </p>
                <p className="num mt-1.5 text-[11px] text-fg-muted">
                  {verification.verified_entries} entr
                  {verification.verified_entries === 1 ? "y" : "ies"} recomputed and re-linked
                </p>
                {verification.verified_entries === 0 ? (
                  <p className="mt-1.5 max-w-lg text-[11px] leading-relaxed text-degraded">
                    The chain is empty. An empty chain verifies trivially, which is not evidence
                    that anything was recorded.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="state-down state-tile rounded-xl p-4">
                <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-down">
                  <AlertOctagon className="h-3.5 w-3.5" />
                  chain broken
                </p>
                <p className="num mt-1.5 font-mono text-[11px] text-down">
                  first bad entry: #{verification.failure_index}
                </p>
                <p className="mt-1 max-w-lg text-[11px] leading-relaxed text-fg-muted">
                  {verification.failure_reason}
                </p>
              </div>
            )}

            {verification.head_hash ? (
              <div>
                <p className="eyebrow mb-1.5">Chain head</p>
                <p className="select-all break-all font-mono text-[11px] text-fg-muted">
                  {verification.head_hash}
                </p>
              </div>
            ) : null}
          </>
        ) : null}

        {data && data.entries.length > 0 ? (
          <div>
            <p className="eyebrow mb-2">Most recent entries</p>
            <ul className="space-y-1.5">
              {data.entries.map((entry) => {
                const related =
                  highlightAttemptId !== undefined && entry.payload.includes(highlightAttemptId);
                return (
                  <li
                    key={entry.entry_hash}
                    className={`rounded-lg border px-3 py-2 ${
                      related ? "border-iris/40 bg-iris/[0.07]" : "border-white/[0.07] bg-white/[0.035]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="num font-mono text-[11px] text-fg">
                        #{entry.entry_index} {entry.event_type}
                      </span>
                      {related ? (
                        <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-iris">
                          this attempt
                        </span>
                      ) : null}
                    </div>
                    <Mono value={entry.entry_hash} className="mt-0.5 block break-all text-[10px]" />
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
