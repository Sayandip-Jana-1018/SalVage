"use client";

import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Radio,
  ShieldAlert,
  Users,
} from "lucide-react";
import React from "react";
import { formatRupees } from "@/lib/formatters";
import { activeIncidents } from "@/lib/mockData";
import { IncidentInfo } from "@/types";

interface IncidentCardProps {
  incident?: IncidentInfo;
}

export function IncidentCard({ incident }: IncidentCardProps): React.ReactElement {
  const inc = incident || activeIncidents[0];

  return (
    <div className="w-full rounded-2xl liquid-glass border border-rose-500/30 p-5 sm:p-6 shadow-[0_10px_40px_rgba(244,63,94,0.1)] relative overflow-hidden">
      {/* Background soft red aura */}
      <div className="absolute -right-16 -top-16 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-rose-500/20">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
          </span>
          <h3 className="text-xs sm:text-sm font-serif font-bold text-white tracking-wide">
            ACTIVE SYSTEMIC INCIDENT · {inc.id}
          </h3>
          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/60 font-semibold">
            {inc.severity}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>Detected: 14:02:11 IST (2m 14s ago)</span>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-white/5 font-mono">
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Degraded Rail</span>
          <span className="text-xs sm:text-sm font-bold text-rose-300 block mt-0.5 truncate">
            {inc.rail_id}
          </span>
        </div>

        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Affected Merchants</span>
          <span className="text-xs sm:text-sm font-bold text-slate-100 block mt-0.5 tabular-nums">
            {inc.affected_merchants} Merchants
          </span>
        </div>

        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Rupees at Risk</span>
          <span className="text-xs sm:text-sm font-bold text-rose-400 block mt-0.5 tabular-nums">
            {formatRupees(inc.money_at_risk_paise)}
          </span>
        </div>

        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Auto-Rerouted</span>
          <span className="text-xs sm:text-sm font-bold text-emerald-400 block mt-0.5 tabular-nums">
            {inc.auto_rerouted_count.toLocaleString()} txns
          </span>
        </div>
      </div>

      {/* Auto Mitigation Status */}
      <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-300 font-sans">
          <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong className="text-emerald-400">Autonomous Mitigation Active:</strong> {inc.active_mitigation}
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400 shrink-0">
          <Users className="w-3.5 h-3.5 text-slate-500" />
          <span>Root Cause: {inc.root_cause}</span>
        </div>
      </div>
    </div>
  );
}
