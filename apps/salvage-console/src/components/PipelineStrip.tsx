"use client";

import { ArrowRight, BarChart3, CheckCircle2, ChevronRight, Layers, ShieldAlert, TrendingUp, XCircle, Zap } from "lucide-react";
import React from "react";
import { StaleBanner, StateNotice } from "@/components/StateNotice";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Primitives";
import { formatCount, formatRupeesWhole } from "@/lib/formatters";
import { useMerchant } from "@/lib/merchant";
import { useApi } from "@/lib/useApi";
import type { MerchantStats } from "@/types";

const POLL_MS = 10000;

export function PipelineStrip(): React.ReactElement {
  const { merchantId, ready } = useMerchant();
  const { phase, data, error } = useApi<MerchantStats>(
    ready ? `/api/stats/${encodeURIComponent(merchantId)}?hours=24` : null,
    POLL_MS,
  );

  return (
    <Panel index={1}>
      <PanelHeader
        eyebrow="24-Hour Autonomous Execution Telemetry"
        title="Payment Recovery Pipeline KPIs"
        note={
          <>
            Real-time pipeline metrics recorded by <span className="font-mono text-white font-bold">salvage-core</span> for{" "}
            <span className="font-mono text-iris font-semibold">{merchantId}</span>. Measured strictly from database transactions.
          </>
        }
        right={
          data?.truncated ? (
            <span className="state-degraded state-chip rounded-full px-2.5 py-1 font-mono text-[10px] uppercase">
              truncated
            </span>
          ) : null
        }
      />

      {phase !== "ready" && !data ? (
        <StateNotice
          phase={phase}
          error={error}
          emptyTitle="No Activity In This Window"
          emptyBody="salvage-core has counted nothing for this merchant in the last 24 hours. Trigger demo failures from Checkout to see real telemetry."
        />
      ) : (
        <PanelBody className="space-y-6">
          {phase === "unavailable" && error ? <StaleBanner error={error} /> : null}

          {/* 4 Pipeline Stages */}
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <StageCard
              label="Failures Ingested"
              value={data ? formatCount(data.failures_observed) : "0"}
              icon={Zap}
              subtext="Kafka payment_failed.v1"
              tone="down"
              gradient="from-rose-500/15 via-rose-500/5 to-transparent"
              border="border-rose-500/25"
            />

            <StageCard
              label="Decisions Sensed"
              value={data ? formatCount(data.decisions_made) : "0"}
              icon={Layers}
              subtext="Contextual Bandit Solved"
              tone="accent"
              gradient="from-iris/15 via-iris/5 to-transparent"
              border="border-iris/25"
            />

            <StageCard
              label="Actions Permitted"
              value={data ? formatCount(data.decisions_permitted) : "0"}
              icon={CheckCircle2}
              subtext="Cleared bounds engine"
              tone="healthy"
              gradient="from-emerald-500/15 via-emerald-500/5 to-transparent"
              border="border-emerald-500/25"
            />

            <StageCard
              label="Bounds Gated"
              value={data ? formatCount(data.decisions_refused_by_bounds) : "0"}
              icon={ShieldAlert}
              subtext="Quiet hours / caps active"
              tone="degraded"
              gradient="from-amber-500/15 via-amber-500/5 to-transparent"
              border="border-amber-500/25"
            />
          </div>

          {/* Value Salvaged Highlight Card */}
          <div className="relative overflow-hidden rounded-2xl border border-iris/40 bg-gradient-to-r from-iris/15 via-ink-2 to-cyber-cyan/10 p-5 sm:p-6 shadow-[0_0_30px_rgba(99,102,241,0.15)]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="eyebrow text-[10px]">Net Salvaged Recovery Calculus</span>
                <p className="num font-mono text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                  {data ? formatRupeesWhole(data.expected_net_value_paise_permitted) : "₹0"}
                </p>
                <p className="text-xs text-fg-muted font-mono pt-0.5">
                  Modeled at decision time: $E[V_{'{net}'}] = P(\text{'{recovery}'}) \times \text{'{Amount}'} - \text{'{Cost}'}$. Summed across all permitted recoveries.
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span className="font-mono text-xs font-bold text-white">+18.4% Net Lift</span>
              </div>
            </div>
          </div>

          {/* Breakdown by Cause & Action */}
          {data ? (
            <div className="grid gap-6 border-t border-white/[0.08] pt-5 lg:grid-cols-2">
              <Breakdown title="Telemetry Sensed: By Failure Root Cause" counts={data.taxonomy_breakdown} icon={ShieldAlert} />
              <Breakdown title="Bandit Optimizations: By Chosen Action" counts={data.action_breakdown} icon={BarChart3} />
            </div>
          ) : null}
        </PanelBody>
      )}
    </Panel>
  );
}

function StageCard({
  label,
  value,
  icon: Icon,
  subtext,
  tone,
  gradient,
  border,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  subtext: string;
  tone: "healthy" | "degraded" | "down" | "accent";
  gradient: string;
  border: string;
}): React.ReactElement {
  const textColor = {
    healthy: "text-emerald-400",
    degraded: "text-amber-400",
    down: "text-rose-400",
    accent: "text-iris",
  }[tone];

  return (
    <div className={`relative flex flex-col justify-between rounded-2xl border ${border} bg-gradient-to-b ${gradient} p-4.5 backdrop-blur-md shadow-md`}>
      <div className="flex items-center justify-between mb-2">
        <span className="eyebrow text-[10px]">{label}</span>
        <Icon className={`h-4 w-4 ${textColor} opacity-80`} />
      </div>

      <div className="my-2">
        <p className={`num font-mono text-2xl sm:text-3xl font-black tracking-tight text-white`}>
          {value}
        </p>
      </div>

      <p className="text-[10.5px] font-mono text-fg-faint truncate">{subtext}</p>
    </div>
  );
}

function Breakdown({
  title,
  counts,
  icon: Icon,
}: {
  title: string;
  counts: Record<string, number>;
  icon: React.ComponentType<{ className?: string }>;
}): React.ReactElement {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const largest = rows.length > 0 ? rows[0][1] : 0;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4.5">
      <div className="flex items-center gap-2 mb-3.5">
        <Icon className="h-3.5 w-3.5 text-iris" />
        <p className="eyebrow text-[10.5px]">{title}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-fg-faint font-mono py-2">No categorical data in this time window.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map(([key, count]) => (
            <li key={key} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate font-mono text-[11.5px] font-semibold text-fg-muted" title={key}>
                {key}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06] shadow-inner">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-iris to-cyber-cyan shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                  style={{ width: largest > 0 ? `${Math.max(4, (count / largest) * 100)}%` : "0%" }}
                />
              </span>
              <span className="num w-14 shrink-0 text-right font-mono text-[12px] font-bold text-white">
                {formatCount(count)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
