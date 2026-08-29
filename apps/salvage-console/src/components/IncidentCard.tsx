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
    <div className="w-full rounded-2xl bg-gradient-to-b from-rose-50/80 via-white to-white p-6 shadow-[0_10px_30px_rgba(244,63,94,0.06)] border border-rose-200/90 relative overflow-hidden text-center flex flex-col items-center">
      {/* Background soft red aura */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-rose-500/08 rounded-full blur-3xl pointer-events-none" />

      {/* Centered Header */}
      <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-2.5 pb-4 border-b border-rose-100 relative z-10">
        <div className="flex items-center justify-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
          </span>
          <h3 className="text-sm font-serif font-bold text-slate-900 tracking-wide">
            ACTIVE SYSTEMIC INCIDENT · {inc.id}
          </h3>
          <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-bold">
            {inc.severity}
          </span>
        </div>

        <span className="hidden sm:inline text-slate-300">·</span>

        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Detected: 14:02:11 IST (2m 14s ago)</span>
        </div>
      </div>

      {/* Centered Details Grid */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-4 py-5 border-b border-slate-100 font-mono text-center">
        <div className="flex flex-col items-center justify-center">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Degraded Rail</span>
          <span className="text-xs sm:text-sm font-bold text-rose-700 block mt-1 truncate">
            {inc.rail_id}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Affected Merchants</span>
          <span className="text-xs sm:text-sm font-bold text-slate-800 block mt-1 tabular-nums">
            {inc.affected_merchants} Merchants
          </span>
        </div>

        <div className="flex flex-col items-center justify-center">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Rupees at Risk</span>
          <span className="text-xs sm:text-sm font-bold text-rose-600 block mt-1 tabular-nums">
            {formatRupees(inc.money_at_risk_paise)}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">Auto-Rerouted</span>
          <span className="text-xs sm:text-sm font-bold text-emerald-700 block mt-1 tabular-nums">
            {inc.auto_rerouted_count.toLocaleString()} txns
          </span>
        </div>
      </div>

      {/* Centered Auto Mitigation Status */}
      <div className="pt-4 w-full flex flex-col sm:flex-row items-center justify-center gap-4 text-xs text-center">
        <div className="flex items-center justify-center gap-2 text-slate-700 font-sans">
          <ShieldAlert className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong className="text-emerald-700 font-semibold">Autonomous Mitigation Active:</strong> {inc.active_mitigation}
          </span>
        </div>

        <span className="hidden sm:inline text-slate-300">·</span>

        <div className="flex items-center justify-center gap-1.5 font-mono text-[11px] text-slate-500">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span>Root Cause: {inc.root_cause}</span>
        </div>
      </div>
    </div>
  );
}
