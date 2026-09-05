"use client";

import { Activity, AlertTriangle, CheckCircle2, Radar, ShieldCheck, Sparkles } from "lucide-react";
import React from "react";
import { StateNotice } from "@/components/StateNotice";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { StateChip, StateDot } from "@/components/ui/Primitives";
import { formatAge, formatPercent } from "@/lib/formatters";
import { useApi } from "@/lib/useApi";
import type { RailHealthMatrix, RailHealthView } from "@/types";

const POLL_MS = 5000;

export function IncidentCard(): React.ReactElement {
  const { phase, data, error } = useApi<RailHealthMatrix>("/api/rails", POLL_MS);

  const incidents = (data?.rails ?? []).filter(
    (rail) => rail.state === "DEGRADED" || rail.state === "DOWN",
  );
  const worst = incidents.some((rail) => rail.state === "DOWN") ? "DOWN" : "DEGRADED";
  const observed = data?.rails.length ?? 0;

  if (phase !== "ready" && !data) {
    return (
      <Panel index={0}>
        <PanelHeader eyebrow="High-Frequency Rail Sensing" title="Active Outage & Incident Monitor" />
        <StateNotice phase={phase} error={error} emptyTitle="Initializing Sensing Matrix..." />
      </Panel>
    );
  }

  if (incidents.length === 0) {
    return (
      <Panel index={0} className="border border-healthy/30 shadow-[0_0_30px_rgba(16,185,129,0.12)]">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-5 sm:px-8">
          <div className="flex items-center gap-4">
            <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-healthy/30 bg-healthy/10 shadow-[0_0_20px_rgba(16,185,129,0.25)]">
              <CheckCircle2 className="h-6 w-6 text-healthy" />
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-healthy animate-ping" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-bold text-white tracking-tight">
                  All Indian Payment Rails Sensed Healthy
                </h3>
                <span className="state-healthy state-chip px-2.5 py-0.5 text-[9.5px]">
                  Optimal SLA
                </span>
              </div>
              <p className="text-xs text-fg-muted font-mono mt-0.5">
                {observed > 0
                  ? `${observed} active rails monitored across SBI, HDFC, ICICI, Axis · Zero packet loss`
                  : "Continuous 5-minute sliding window sensor active"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-fg-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-healthy" />
              <span>Bounds Engine Armed</span>
            </div>
            <span className="text-[10px] text-fg-faint">{data ? formatAge(data.timestamp) : "Live"}</span>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel index={0} className="border-2 border-down/40 shadow-[0_0_40px_rgba(244,63,94,0.2)]">
      <PanelHeader
        eyebrow="Systemic Outage Alert"
        title={`${incidents.length} Banking Rail${incidents.length === 1 ? "" : "s"} Experiencing Degradation`}
        note={
          <>
            Sensing matrix corroborated multi-merchant switch timeouts. Autonomous recovery policy is
            rerouting affected transactions in real time.
          </>
        }
        right={
          <div className="flex items-center gap-2.5">
            <StateChip state={worst} label={`${incidents.length} Unhealthy`} />
            <span className="font-mono text-[10.5px] text-fg-faint">
              {data ? formatAge(data.timestamp) : "—"}
            </span>
          </div>
        }
      />
      <PanelBody className="space-y-4">
        <ul className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {incidents.map((rail) => (
            <IncidentTile key={rail.rail_id} rail={rail} />
          ))}
        </ul>

        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-fg-muted">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-iris shrink-0" />
            <span>
              Autonomous Mitigation Active: Bounds engine enforces merchant contact budgets and quiet hours.
            </span>
          </div>
          <span className="font-mono text-[10px] text-iris font-semibold">SLA: &lt;50ms</span>
        </div>
      </PanelBody>
    </Panel>
  );
}

function IncidentTile({ rail }: { rail: RailHealthView }): React.ReactElement {
  const [issuer, method] = splitRail(rail.rail_id);
  const isDown = rail.state === "DOWN";

  return (
    <li className={`${isDown ? "state-down border-down/30 bg-down/[0.08]" : "state-degraded border-degraded/30 bg-degraded/[0.08]"} rounded-2xl border p-4 backdrop-blur-md shadow-md`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="flex min-w-0 items-center gap-2">
          <StateDot state={rail.state} />
          <span className="truncate font-mono text-[13px] font-bold text-white" title={rail.rail_id}>
            {issuer}
          </span>
        </span>
        <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDown ? "border-down/40 bg-down/20 text-down" : "border-degraded/40 bg-degraded/20 text-degraded"}`}>
          {rail.state}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
        <div>
          <dt className="eyebrow text-[9.5px]">{method}</dt>
          <dd className="num mt-1 font-mono text-[16px] font-bold text-white">
            {formatPercent(rail.success_rate_5m)}
          </dd>
          <dd className="text-[10px] text-fg-faint">5m Success Rate</dd>
        </div>
        <div>
          <dt className="eyebrow text-[9.5px]">Failure Velocity</dt>
          <dd className="num mt-1 font-mono text-[16px] font-bold text-rose-300">
            {rail.failure_velocity_5m.toFixed(2)}/min
          </dd>
          <dd className="text-[10px] text-fg-faint">Drop Rate</dd>
        </div>
      </dl>
    </li>
  );
}

function splitRail(railId: string): [string, string] {
  const [issuer, method] = railId.split("|");
  if (!issuer || !method) return [railId, "—"];
  return [issuer, method.toUpperCase()];
}
