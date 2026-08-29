"use client";

import { AlertTriangle, CheckCheck, Clock, ShieldAlert, Users } from "lucide-react";
import { formatRupees } from "@/lib/formatters";
import { IncidentInfo } from "@/types";

interface IncidentCardProps {
  incident: IncidentInfo;
}

export function IncidentCard({ incident }: IncidentCardProps) {
  return (
    <div className="rounded-lg border border-rose-900/60 bg-gradient-to-br from-rose-950/30 to-[#0d1117] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-rose-900/40 border border-rose-700/60 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-4 h-4 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                ACTIVE OUTAGE: {incident.bank}
              </span>
              <span className="text-xs text-rose-400 font-mono font-semibold">
                {incident.rail_id}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-slate-100 mt-1">{incident.root_cause}</h3>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Active for 18m</span>
        </div>
      </div>

      {/* Blast Radius Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 font-mono text-xs">
        <div className="p-3 rounded bg-slate-900/60 border border-slate-800/80 flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Users className="w-3 h-3 text-slate-400" />
            Affected Merchants
          </span>
          <span className="text-sm font-bold text-slate-100 mt-0.5 tabular-nums">
            {incident.affected_merchants} Tenants
          </span>
        </div>

        <div className="p-3 rounded bg-slate-900/60 border border-slate-800/80 flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            Money at Risk
          </span>
          <span className="text-sm font-bold text-rose-400 mt-0.5 tabular-nums">
            {formatRupees(incident.money_at_risk_paise)}
          </span>
        </div>

        <div className="p-3 rounded bg-slate-900/60 border border-slate-800/80 flex flex-col">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <CheckCheck className="w-3 h-3 text-emerald-400" />
            Auto-Rerouted Volume
          </span>
          <span className="text-sm font-bold text-emerald-400 mt-0.5 tabular-nums">
            {incident.auto_rerouted_count} Attempts
          </span>
        </div>
      </div>

      {/* Active Autonomous Mitigation */}
      <div className="mt-3.5 pt-3 border-t border-rose-950/60 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-400">Autonomous Mitigation:</span>
          <span className="text-emerald-400 font-semibold">{incident.active_mitigation}</span>
        </div>
      </div>
    </div>
  );
}
