"use client";

import { AlertOctagon, ArrowRight, CheckCircle2, Copy, Database, ExternalLink, Hash, Lock, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { StaleBanner, StateNotice } from "@/components/StateNotice";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Chip, DataTable, Mono, Td, Th } from "@/components/ui/Primitives";
import { formatISTTime } from "@/lib/formatters";
import { useMerchant } from "@/lib/merchant";
import { useApi } from "@/lib/useApi";
import type { ChainVerification, LedgerEntryView } from "@/types";

const POLL_MS = 5000;

interface LedgerPayload {
  verification: ChainVerification;
  entries: LedgerEntryView[];
}

export function LiveDecisionStream(): React.ReactElement {
  const { merchantId, ready } = useMerchant();
  const { phase, data, error, lastUpdated } = useApi<LedgerPayload>(
    ready ? `/api/ledger/${encodeURIComponent(merchantId)}?limit=25` : null,
    POLL_MS,
  );

  return (
    <Panel index={3}>
      <PanelHeader
        eyebrow="Immutable Audit Trail"
        title="Tamper-Evident SHA-256 Decision Ledger"
        note={
          <>
            Every autonomous routing decision, retry attempt, and saga transition is cryptographically
            hash-chained for <span className="font-mono text-iris font-semibold">{merchantId}</span>. Guaranteed immutable and non-repudiable.
          </>
        }
        right={
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            {data ? <ChainBadge verification={data.verification} /> : null}
            {lastUpdated ? (
              <span className="num font-mono text-[10.5px] text-fg-faint bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/10">
                Live: {formatISTTime(lastUpdated.toISOString())} IST
              </span>
            ) : null}
          </div>
        }
      />

      {phase !== "ready" && !data ? (
        <StateNotice
          phase={phase}
          error={error}
          emptyTitle="Connecting to Ledger Stream..."
          emptyBody="Streaming cryptographic blocks from salvage-core..."
        />
      ) : data && data.entries.length === 0 ? (
        <PanelBody className="py-12 text-center">
          <div className="mx-auto max-w-md space-y-4">
            <div className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-iris/40 bg-iris/10 shadow-[0_0_25px_rgba(99,102,241,0.25)]">
              <Lock className="h-6 w-6 text-iris" />
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-healthy animate-ping" />
            </div>

            <div>
              <h3 className="text-[16px] font-bold text-white tracking-tight">
                Cryptographic Genesis Block Initialized
              </h3>
              <p className="text-xs text-fg-muted font-mono mt-1">
                The append-only ledger for <span className="text-iris font-semibold">{merchantId}</span> is active and verified. No transactions have been executed yet.
              </p>
            </div>

            <div className="pt-2">
              <Link
                href="/checkout"
                className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-xs font-bold text-ink-0 shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all hover:bg-white hover:scale-105"
              >
                <span>Trigger Live Demo Failure in Checkout</span>
                <ArrowRight className="h-3.5 w-3.5 stroke-[3]" />
              </Link>
            </div>
          </div>
        </PanelBody>
      ) : (
        <PanelBody className="!px-0 !py-0">
          {phase === "unavailable" && error ? (
            <div className="px-6 pt-4">
              <StaleBanner error={error} />
            </div>
          ) : null}

          <div className="px-3 py-3">
            <DataTable
              head={
                <>
                  <Th align="right">Block #</Th>
                  <Th>Event Signature</Th>
                  <Th>Target Entity</Th>
                  <Th>Committed (IST)</Th>
                  <Th>Cryptographic Hash (SHA-256)</Th>
                </>
              }
            >
              {data?.entries.map((entry) => (
                <tr key={entry.entry_hash} className="transition-colors hover:bg-white/[0.04] group">
                  <Td align="right" className="num font-mono text-iris font-bold text-[12px]">
                    #{entry.entry_index}
                  </Td>
                  <Td>
                    <Chip tone="accent">{entry.event_type}</Chip>
                  </Td>
                  <Td className="font-mono text-[11.5px] text-fg font-medium">{entry.entity_type}</Td>
                  <Td className="num font-mono text-[11.5px] text-fg-muted">{formatISTTime(entry.created_at)}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Mono value={entry.entry_hash} chars={24} className="text-[11px] group-hover:border-iris/40" />
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-fg-faint">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      </span>
                    </div>
                  </Td>
                </tr>
              ))}
            </DataTable>
          </div>
        </PanelBody>
      )}
    </Panel>
  );
}

function ChainBadge({ verification }: { verification: ChainVerification }): React.ReactElement {
  if (!verification.valid) {
    return (
      <span className="state-down state-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10.5px] font-bold uppercase tracking-wider">
        <AlertOctagon className="h-3.5 w-3.5" />
        Chain Broken At #{verification.failure_index}
      </span>
    );
  }
  return (
    <span className="state-healthy state-chip inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[10.5px] font-bold uppercase tracking-wider shadow-sm">
      <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
      <span>{verification.verified_entries} Blocks Verified</span>
    </span>
  );
}
