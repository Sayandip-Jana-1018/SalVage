"use client";

import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { formatISTTime, formatRupees } from "@/lib/formatters";

export function Header() {
  const [time, setTime] = useState<string>("");
  const moneyAtRiskPaise = 34285000;
  const recoveredRevenuePaise = 181000000;
  const recoveryRate = 0.53;

  useEffect(() => {
    setTime(formatISTTime(new Date().toISOString()));
    const interval = setInterval(() => {
      setTime(formatISTTime(new Date().toISOString()));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="border-b border-slate-800/80 bg-[#0c0f16]/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Status */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-emerald-950/80 border border-emerald-700/50 flex items-center justify-center text-emerald-400 font-mono font-bold text-sm tracking-tight shadow-[0_0_12px_rgba(16,185,129,0.15)]">
            SV
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-100 text-sm tracking-wide">SALVAGE</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50">
                Core Engine
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE AUTONOMOUS POLICY</span>
            </div>
          </div>
        </div>

        {/* Global Key Metrics Ticker */}
        <div className="flex items-center gap-6 font-mono text-xs">
          {/* Money at Risk */}
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-rose-400" />
              Money at Risk (Live)
            </span>
            <span className="text-sm font-semibold text-rose-400 tabular-nums">
              {formatRupees(moneyAtRiskPaise)}
            </span>
          </div>

          <div className="h-6 w-px bg-slate-800" />

          {/* Recovered Revenue */}
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Recovered Revenue (24h)
            </span>
            <span className="text-sm font-semibold text-emerald-400 tabular-nums">
              {formatRupees(recoveredRevenuePaise)}
            </span>
          </div>

          <div className="h-6 w-px bg-slate-800" />

          {/* Recovery Rate */}
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-indigo-400" />
              Recovery Rate
            </span>
            <span className="text-sm font-semibold text-indigo-300 tabular-nums">
              {(recoveryRate * 100).toFixed(1)}%
            </span>
          </div>

          <div className="h-6 w-px bg-slate-800" />

          {/* Clock */}
          <div className="flex flex-col text-right">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">IST (Asia/Kolkata)</span>
            <span className="text-sm text-slate-300 tabular-nums font-mono">{time || "00:00:00"}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
