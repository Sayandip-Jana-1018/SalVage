"use client";

import { ArrowRight, Clock, FileSearch, Layers, Search, ShieldAlert, Sparkles, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { StaleBanner, StateNotice } from "@/components/StateNotice";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Measure, Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Chip, DataTable, Mono, Td, Th } from "@/components/ui/Primitives";
import { formatAge, formatCount, formatPaise } from "@/lib/formatters";
import { useMerchant } from "@/lib/merchant";
import { useApi } from "@/lib/useApi";
import type { AttemptPage } from "@/types";

const POLL_MS = 15000;
const LIMIT = 50;

export default function AutopsyIndexPage(): React.ReactElement {
  const router = useRouter();
  const { merchantId, setMerchantId, ready } = useMerchant();
  const [attemptId, setAttemptId] = useState("");

  const { phase, data, error } = useApi<AttemptPage>(
    ready ? `/api/attempts/${encodeURIComponent(merchantId)}?limit=${LIMIT}` : null,
    POLL_MS,
  );

  const open = (id: string) =>
    router.push(`/autopsy/${encodeURIComponent(id)}?merchant=${encodeURIComponent(merchantId)}`);

  return (
    <div className="space-y-7">
      <ConnectionBanner />

      {/* Search Bar Panel */}
      <Panel index={0}>
        <PanelHeader
          eyebrow="Per-Attempt Causal Reconstruction"
          title="Payment Decision Autopsy"
          note="Reconstruct every payment failure end-to-end: Kafka payload telemetry, 2D sensing corroboration, counterfactual bandit action ranking, and immutable SHA-256 ledger proof."
        />
        <PanelBody>
          <Measure width="wide">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = attemptId.trim();
                if (trimmed) open(trimmed);
              }}
              className="flex flex-col gap-4 sm:flex-row sm:items-end"
            >
              <label className="block sm:w-56">
                <span className="eyebrow text-[10.5px]">Merchant Tenant</span>
                <input
                  value={merchantId}
                  onChange={(event) => setMerchantId(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 font-mono text-[13px] font-bold text-white outline-none transition-all focus:border-iris focus:bg-white/[0.08] focus:shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                />
              </label>

              <label className="block flex-1">
                <span className="eyebrow text-[10.5px]">Payment Attempt ID</span>
                <span className="relative mt-2 block">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-iris" />
                  <input
                    value={attemptId}
                    onChange={(event) => setAttemptId(event.target.value)}
                    placeholder="e.g. pay_console_... or ord_..."
                    className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.04] pl-11 pr-4 font-mono text-[13px] text-white placeholder:text-fg-faint/60 outline-none transition-all focus:border-iris focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                  />
                </span>
              </label>

              <button
                type="submit"
                disabled={!attemptId.trim()}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-iris px-6 text-[13px] font-bold text-ink-0 shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all duration-300 hover:bg-white hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-iris cursor-pointer"
              >
                <span>Investigate</span>
                <ArrowRight className="h-4 w-4 stroke-[3]" />
              </button>
            </form>
          </Measure>
        </PanelBody>
      </Panel>

      {/* Recent Attempts Table Panel */}
      <Panel index={1}>
        <PanelHeader
          eyebrow={`Newest Ingested First · Up to ${LIMIT} Records`}
          title="Recent Payment Failure Attempts"
          note={
            <>
              Live telemetry streamed directly from <span className="font-mono text-white font-semibold">salvage-brain</span>.
              Click any transaction row to open the complete causal investigation report.
            </>
          }
          right={
            data ? (
              <span className="rounded-full border border-iris/30 bg-iris/10 px-3 py-1 font-mono text-[11px] font-bold text-iris shadow-sm">
                {formatCount(data.attempts.length)} attempts tracked
              </span>
            ) : null
          }
        />

        {phase !== "ready" && !data ? (
          <StateNotice
            phase={phase}
            error={error}
            emptyTitle="Reading Attempts Stream..."
            emptyBody="Fetching transaction attempts from salvage-brain..."
          />
        ) : data && data.attempts.length === 0 ? (
          <PanelBody className="py-12 text-center">
            <div className="mx-auto max-w-md space-y-4">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-iris/30 bg-iris/10 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                <FileSearch className="h-6 w-6 text-iris" />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-white">No Attempts Ingested for Tenant</h3>
                <p className="text-xs text-fg-muted font-mono mt-1">
                  salvage-brain has recorded zero failures for <span className="text-iris font-semibold">{merchantId}</span>.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  href="/checkout"
                  className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-xs font-bold text-ink-0 shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all hover:bg-white hover:scale-105"
                >
                  <span>Go to Checkout to Trigger Demo Failure</span>
                  <ArrowRight className="h-3.5 w-3.5 stroke-[3]" />
                </Link>
              </div>
            </div>
          </PanelBody>
        ) : (
          <PanelBody className="!px-3 !py-3">
            {phase === "unavailable" && error ? (
              <div className="px-3 pb-3">
                <StaleBanner error={error} />
              </div>
            ) : null}

            <DataTable
              head={
                <>
                  <Th>Payment Attempt & Order ID</Th>
                  <Th align="right">Amount (INR)</Th>
                  <Th>Banking Rail / Method</Th>
                  <Th align="right">Error Signals</Th>
                  <Th align="right">Ingested</Th>
                  <Th align="right">Action</Th>
                </>
              }
            >
              {data?.attempts.map((attempt) => (
                <tr
                  key={attempt.payment_attempt_id}
                  className="cursor-pointer transition-all hover:bg-white/[0.04] group"
                  onClick={() => open(attempt.payment_attempt_id)}
                >
                  <Td>
                    <div className="flex items-center gap-2">
                      <Mono value={attempt.payment_attempt_id} chars={28} className="text-white font-bold group-hover:border-iris/50" />
                    </div>
                    <span className="mt-1 block font-mono text-[10.5px] text-fg-faint">
                      {attempt.order_id}
                    </span>
                  </Td>

                  <Td align="right" className="num font-mono text-[14px] font-extrabold text-white">
                    {formatPaise(attempt.amount_paise)}
                  </Td>

                  <Td>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-lg border border-white/15 bg-white/[0.05] px-2 py-0.5 font-mono text-[10.5px] font-bold text-fg">
                        {attempt.issuer}
                      </span>
                      <span className="rounded-lg border border-iris/40 bg-iris/15 px-2 py-0.5 font-mono text-[10px] font-bold text-iris">
                        {attempt.payment_method.toUpperCase()}
                      </span>
                    </span>
                  </Td>

                  <Td
                    align="right"
                    className="num font-mono text-xs font-bold"
                  >
                    {attempt.failure_count > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-rose-300">
                        {formatCount(attempt.failure_count)} failure
                      </span>
                    ) : (
                      <span className="text-fg-faint">0</span>
                    )}
                  </Td>

                  <Td align="right" className="num font-mono text-[11px] text-fg-muted">
                    {formatAge(attempt.created_at)}
                  </Td>

                  <Td align="right">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-iris group-hover:translate-x-1 transition-transform">
                      <span>Autopsy</span>
                      <ArrowRight className="h-3.5 w-3.5 stroke-[3]" />
                    </span>
                  </Td>
                </tr>
              ))}
            </DataTable>
          </PanelBody>
        )}
      </Panel>
    </div>
  );
}
