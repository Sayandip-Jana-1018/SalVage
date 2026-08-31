"use client";

import { AlertOctagon, ShieldCheck } from "lucide-react";
import React from "react";
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

/**
 * The ledger, tailed live. This is the decision stream.
 *
 * Every recovery decision and saga transition is appended to the hash-chained
 * ledger inside the same transaction that records it, so the ledger *is* the
 * authoritative stream of what the system did. Reading it here rather than
 * keeping a separate feed means the operator sees exactly the rows an auditor
 * would, with the chain verdict beside them.
 *
 * The version this replaces mapped over a checked-in array and advertised
 * "Auto-refreshing (<50ms SLA)" — a latency claim about a system that was not
 * being contacted.
 */
export function LiveDecisionStream(): React.ReactElement {
  const { merchantId, ready } = useMerchant();
  const { phase, data, error, lastUpdated } = useApi<LedgerPayload>(
    ready ? `/api/ledger/${encodeURIComponent(merchantId)}?limit=25` : null,
    POLL_MS,
  );

  return (
    <Panel index={3}>
      <PanelHeader
        eyebrow="Append-only"
        title="Ledger stream"
        note={
          <>
            Every decision and saga transition, appended to the tamper-evident chain for{" "}
            <span className="font-mono text-fg-muted">{merchantId}</span>.
          </>
        }
        right={
          <div className="flex flex-col items-center gap-1.5">
            {data ? <ChainBadge verification={data.verification} /> : null}
            {lastUpdated ? (
              <span className="num font-mono text-[10px] text-fg-faint">
                {formatISTTime(lastUpdated.toISOString())} IST
              </span>
            ) : null}
          </div>
        }
      />

      {phase !== "ready" && !data ? (
        <StateNotice
          phase={phase}
          error={error}
          emptyTitle="No ledger entries"
          emptyBody="Nothing has been appended for this merchant yet. Entries appear as soon as the policy engine records a decision."
        />
      ) : data && data.entries.length === 0 ? (
        <StateNotice
          phase="missing"
          emptyTitle="Ledger is empty"
          emptyBody="salvage-core answered and this merchant has no ledger entries. An empty chain verifies trivially; that is not evidence anything was recorded."
        />
      ) : (
        <PanelBody className="!px-0 !py-0">
          {phase === "unavailable" && error ? (
            <div className="px-5 pt-4">
              <StaleBanner error={error} />
            </div>
          ) : null}

          <div className="px-2 py-1">
            <DataTable
              head={
                <>
                  <Th align="right">#</Th>
                  <Th>Event</Th>
                  <Th>Entity</Th>
                  <Th>Recorded (IST)</Th>
                  <Th>Entry hash</Th>
                </>
              }
            >
              {data?.entries.map((entry) => (
                <tr key={entry.entry_hash} className="transition-colors hover:bg-white/[0.035]">
                  <Td align="right" className="num font-mono text-fg-faint">
                    {entry.entry_index}
                  </Td>
                  <Td>
                    <Chip>{entry.event_type}</Chip>
                  </Td>
                  <Td className="font-mono text-fg-muted">{entry.entity_type}</Td>
                  <Td className="num font-mono text-fg-muted">{formatISTTime(entry.created_at)}</Td>
                  <Td>
                    <Mono value={entry.entry_hash} chars={18} className="text-[11px]" />
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
      <span className="state-down state-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider">
        <AlertOctagon className="h-3 w-3" />
        chain broken at #{verification.failure_index}
      </span>
    );
  }
  return (
    <span className="state-healthy state-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider">
      <ShieldCheck className="h-3 w-3" />
      {verification.verified_entries} verified server-side
    </span>
  );
}
