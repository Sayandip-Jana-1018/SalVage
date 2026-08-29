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
    <div className="w-full rounded-2xl bg-gradient-to-r from-rose-50/80 via-white to-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(244,63,94,0.06)] border border-rose-200/90 relative overflow-hidden">
      {/* Background soft red aura */}
      <div className="absolute -right-16 -top-16 w-48 h-48 bg-rose-500/05 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-rose-100">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
          </span>
          <h3 className="text-xs sm:text-sm font-serif font-bold text-slate-900 tracking-wide">
            ACTIVE SYSTEMIC INCIDENT · {inc.id}
          </h3>
          <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-bold">
            {inc.severity}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Detected: 14:02:11 IST (2m 14s ago)</span>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-slate-100 font-mono">
        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Degraded Rail</span>
          <span className="text-xs sm:text-sm font-bold text-rose-700 block mt-0.5 truncate">
            {inc.rail_id}
          </span>
        </div>

        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Affected Merchants</span>
          <span className="text-xs sm:text-sm font-bold text-slate-800 block mt-0.5 tabular-nums">
            {inc.affected_merchants} Merchants
          </span>
        </div>

        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Rupees at Risk</span>
          <span className="text-xs sm:text-sm font-bold text-rose-600 block mt-0.5 tabular-nums">
            {formatRupees(inc.money_at_risk_paise)}
          </span>
        </div>

        <div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Auto-Rerouted</span>
          <span className="text-xs sm:text-sm font-bold text-emerald-700 block mt-0.5 tabular-nums">
            {inc.auto_rerouted_count.toLocaleString()} txns
          </span>
        </div>
      </div>

      {/* Auto Mitigation Status */}
      <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-700 font-sans">
          <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong className="text-emerald-700 font-semibold">Autonomous Mitigation Active:</strong> {inc.active_mitigation}
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 shrink-0">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span>Root Cause: {inc.root_cause}</span>
        </div>
      </div>
    </div>
  );
}
