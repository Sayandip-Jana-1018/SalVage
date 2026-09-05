"use client";

import { Activity, ArrowUpRight, Cpu, Layers, Radio, ShieldCheck, Zap } from "lucide-react";
import React from "react";
import { StaleBanner, StateNotice } from "@/components/StateNotice";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { StateDot } from "@/components/ui/Primitives";
import { formatAge, formatPercent, stateClass } from "@/lib/formatters";
import { useApi } from "@/lib/useApi";
import type { RailHealthMatrix as Matrix, RailHealthView } from "@/types";

const POLL_MS = 5000;

export function RailHealthMatrix(): React.ReactElement {
  const { phase, data, error } = useApi<Matrix>("/api/rails", POLL_MS);

  const rails = data?.rails ?? [];
  const issuers = [...new Set(rails.map((rail) => splitRail(rail.rail_id).issuer))].sort();
  const methods = [...new Set(rails.map((rail) => splitRail(rail.rail_id).method))].sort();

  return (
    <Panel index={2}>
      <PanelHeader
        eyebrow="Real-Time 2D Rail Sensing Matrix"
        title="Banking Rails & Payment Method Health HUD"
        note="Sub-second health vector evaluated over rolling 5-minute sliding windows across merchants. Corroborates banking downtime without polling bank APIs directly."
        right={
          data ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-full border border-iris/30 bg-iris/10 px-3 py-1 font-mono text-[11px] font-bold text-iris shadow-sm">
                <Radio className="h-3 w-3 animate-pulse text-iris" />
                <span>{rails.length} Rails Active</span>
              </div>
              <span className="font-mono text-[10px] text-fg-faint">{formatAge(data.timestamp)}</span>
            </div>
          ) : null
        }
      />

      {phase !== "ready" && !data ? (
        <StateNotice
          phase={phase}
          error={error}
          emptyTitle="Sensing Matrix Initializing..."
          emptyBody="The sensing engine computes 2D health vectors as payment attempts stream through Kafka. Trigger demo transactions in Checkout to observe."
        />
      ) : rails.length === 0 ? (
        <StateNotice
          phase="missing"
          emptyTitle="No Rails Observed in Current Window"
          emptyBody="salvage-brain is ready and listening. Inject sample failures in the Checkout tab to see live rail routing."
        />
      ) : (
        <PanelBody className="!px-0 !py-0">
          {phase === "unavailable" && error ? (
            <div className="px-6 pt-4">
              <StaleBanner error={error} />
            </div>
          ) : null}

          {/* Status Legend Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-white/[0.02] px-6 py-3">
            <div className="flex items-center gap-4">
              {(["HEALTHY", "DEGRADED", "DOWN"] as const).map((state) => (
                <span
                  key={state}
                  className={`${stateClass(state)} flex items-center gap-2 font-mono text-[10.5px] font-bold uppercase tracking-wider`}
                >
                  <StateDot state={state} />
                  <span>{state}</span>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 text-fg-faint font-mono text-[10.5px]">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              <span>Multi-Tenant Corroboration Active</span>
            </div>
          </div>

          {/* Liquid Glass Responsive Table */}
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] bg-black/20">
                  <th className="eyebrow sticky left-0 z-10 bg-ink-1/95 backdrop-blur-md px-6 py-3.5 text-left font-bold">
                    Issuing Bank
                  </th>
                  {methods.map((method) => (
                    <th key={method} className="eyebrow px-4 py-3.5 text-left font-bold">
                      {method}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {issuers.map((issuer) => (
                  <tr key={issuer} className="hover:bg-white/[0.02] transition-colors">
                    <td className="sticky left-0 z-10 bg-ink-1/95 backdrop-blur-md px-6 py-3 font-mono text-[13px] font-bold text-white tracking-wide border-r border-white/[0.04]">
                      {issuer}
                    </td>
                    {methods.map((method) => {
                      const cell = rails.find((rail) => {
                        const parts = splitRail(rail.rail_id);
                        return parts.issuer === issuer && parts.method === method;
                      });
                      return (
                        <td key={method} className="px-3 py-2.5">
                          {cell ? (
                            <RailCell cell={cell} />
                          ) : (
                            <div className="flex items-center justify-center h-14 w-36 rounded-xl border border-white/[0.04] bg-white/[0.01] font-mono text-xs text-fg-faint/30">
                              —
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelBody>
      )}
    </Panel>
  );
}

function RailCell({ cell }: { cell: RailHealthView }): React.ReactElement {
  const isDown = cell.state === "DOWN";
  const isDegraded = cell.state === "DEGRADED";
  const successPct = Math.round(cell.success_rate_5m * 100);

  return (
    <div
      className={`min-w-[10.5rem] rounded-xl border p-3 transition-all duration-300 ${
        isDown
          ? "border-down/40 bg-down/[0.1] shadow-[0_0_15px_rgba(244,63,94,0.2)]"
          : isDegraded
            ? "border-degraded/40 bg-degraded/[0.08] shadow-[0_0_15px_rgba(245,158,11,0.15)]"
            : "border-white/[0.1] bg-white/[0.03] hover:border-emerald-500/30 hover:bg-emerald-500/[0.04]"
      }`}
      title={`${cell.rail_id} · evaluated ${formatAge(cell.last_evaluated_at)}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="flex items-center gap-1.5">
          <StateDot state={cell.state} />
          <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
            isDown ? "text-down" : isDegraded ? "text-degraded" : "text-emerald-400"
          }`}>
            {cell.state}
          </span>
        </span>
        <span className="num font-mono text-xs font-extrabold text-white">
          {formatPercent(cell.success_rate_5m)}
        </span>
      </div>

      {/* Mini Progress Bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06] shadow-inner mb-1.5">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isDown ? "bg-down shadow-[0_0_6px_rgba(244,63,94,0.8)]" : isDegraded ? "bg-degraded shadow-[0_0_6px_rgba(245,158,11,0.8)]" : "bg-healthy shadow-[0_0_6px_rgba(16,185,129,0.8)]"
          }`}
          style={{ width: `${Math.max(4, successPct)}%` }}
        />
      </div>

      <div className="flex items-center justify-between font-mono text-[9.5px] text-fg-faint">
        <span>Failures:</span>
        <span className={cell.failure_velocity_5m > 0 ? "text-rose-300 font-bold" : "text-fg-faint"}>
          {cell.failure_velocity_5m.toFixed(1)}/min
        </span>
      </div>
    </div>
  );
}

function splitRail(railId: string): { issuer: string; method: string } {
  const [issuer, method] = railId.split("|");
  if (!issuer || !method) return { issuer: railId, method: "—" };
  return { issuer, method: method.toUpperCase() };
}
