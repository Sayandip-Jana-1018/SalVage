"use client";

import { CheckCircle2, Clock, ShieldAlert } from "lucide-react";
import React from "react";
import { StateNotice } from "@/components/StateNotice";
import { formatPercent } from "@/lib/formatters";
import { useApi } from "@/lib/useApi";
import type { RailHealthMatrix, RailHealthView } from "@/types";

const POLL_MS = 5000;

/**
 * Rails currently degraded or down, derived from live sensing.
 *
 * The previous version rendered a single hardcoded incident: a named bank, a
 * fixed "34 affected merchants", ₹3.4L at risk, "1,284 txns auto-rerouted",
 * and a detection time of "14:02:11 IST (2m 14s ago)" that never changed. None
 * of it moved, none of it was measured, and it was the first thing on the
 * page.
 *
 * What replaces it reports only what the sensing service knows: which rails
 * are unhealthy and how unhealthy. It does not claim a blast radius, because
 * counting affected merchants means a cross-tenant aggregate that no endpoint
 * serves -- that is ADR-0007 work, and until it exists the number would be
 * invented.
 */
export function IncidentCard(): React.ReactElement {
  const { phase, data, error } = useApi<RailHealthMatrix>("/api/rails", POLL_MS);

  const incidents = (data?.rails ?? []).filter(
    (rail) => rail.state === "DEGRADED" || rail.state === "DOWN",
  );

  if (phase !== "ready" && !data) {
    return (
      <div className="w-full rounded-2xl liquid-glass p-6 border border-slate-200/90">
        <StateNotice phase={phase} error={error} emptyTitle="No sensing data" />
      </div>
    );
  }

  if (incidents.length === 0) {
    return (
      <div className="w-full rounded-2xl bg-gradient-to-b from-emerald-50/70 via-white to-white p-6 shadow-[0_10px_30px_rgba(16,185,129,0.05)] border border-emerald-200/90 text-center flex flex-col items-center gap-2">
        <div className="flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-serif font-bold text-slate-900 tracking-wide">
            NO ACTIVE RAIL INCIDENTS
          </h3>
        </div>
        <p className="text-xs text-slate-600 max-w-lg">
          Every rail the sensing tracker has observed is healthy.
          {data && data.rails.length === 0
            ? " No rails have been observed yet, so this is an absence of data rather than an all-clear."
            : ` ${data?.rails.length} rail${data?.rails.length === 1 ? "" : "s"} under observation.`}
        </p>
      </div>
    );
  }

  const worst = incidents.some((incident) => incident.state === "DOWN") ? "DOWN" : "DEGRADED";

  return (
    <div className="w-full rounded-2xl bg-gradient-to-b from-rose-50/80 via-white to-white p-6 shadow-[0_10px_30px_rgba(244,63,94,0.06)] border border-rose-200/90 relative overflow-hidden text-center flex flex-col items-center">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-2.5 pb-4 border-b border-rose-100 relative z-10">
        <div className="flex items-center justify-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
          </span>
          <h3 className="text-sm font-serif font-bold text-slate-900 tracking-wide">
            {incidents.length} RAIL{incidents.length === 1 ? "" : "S"} UNHEALTHY
          </h3>
          <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-bold">
            {worst}
          </span>
        </div>

        <span className="hidden sm:inline text-slate-300">·</span>

        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Sensed {data ? new Date(data.timestamp).toLocaleTimeString() : "—"}</span>
        </div>
      </div>

      <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 py-5 font-mono">
        {incidents.map((incident) => (
          <IncidentTile key={incident.rail_id} rail={incident} />
        ))}
      </div>

      <div className="pt-1 w-full flex items-center justify-center gap-2 text-xs text-slate-600">
        <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="font-sans">
          Sensing reports rail state. Whether any individual payment is retried, rerouted, or
          left alone is decided per attempt by the policy engine and gated by the bounds engine.
        </span>
      </div>
    </div>
  );
}

function IncidentTile({ rail }: { rail: RailHealthView }): React.ReactElement {
  const down = rail.state === "DOWN";
  return (
    <div
      className={`rounded-xl border p-3.5 flex flex-col items-center gap-1 ${
        down ? "bg-rose-50/70 border-rose-200" : "bg-amber-50/70 border-amber-200"
      }`}
    >
      <span className="text-[11px] font-bold text-slate-900 truncate max-w-full">
        {rail.rail_id}
      </span>
      <span
        className={`text-[10px] font-bold uppercase ${down ? "text-rose-700" : "text-amber-700"}`}
      >
        {rail.state}
      </span>
      <span className="text-[11px] text-slate-700 tabular-nums">
        5m success {formatPercent(rail.success_rate_5m)}
      </span>
      <span className="text-[10px] text-slate-500 tabular-nums">
        failure velocity {rail.failure_velocity_5m.toFixed(2)}
      </span>
    </div>
  );
}
