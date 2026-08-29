"use client";

import {
  AlertCircle,
  CheckCircle2,
  Lock,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { formatISTTime, formatRupees } from "@/lib/formatters";

export function Header(): React.ReactElement {
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
    <header className="w-full border-b border-white/5 bg-[#05070a]/75 backdrop-blur-2xl sticky top-0 z-50 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Status */}
        <div className="flex items-center gap-3.5">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl blur opacity-30 group-hover:opacity-75 transition duration-500" />
            <div className="relative w-9 h-9 rounded-xl liquid-glass-emerald flex items-center justify-center text-emerald-300 font-serif font-bold text-base shadow-inner">
              SV
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif font-bold text-white text-base tracking-tight">
                SALVAGE
              </span>
              <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded-full liquid-glass text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                AUTONOMOUS ENGINE
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="text-slate-500">v1.4.0</span>
              <span>·</span>
              <span className="text-emerald-400/90 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> SHA-256 AUDITED
              </span>
            </div>
          </div>
        </div>

        {/* Global Key Metrics Ticker */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 font-mono text-xs">
          {/* Money at Risk */}
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-rose-400" />
              Money at Risk (Live)
            </span>
            <span className="text-sm font-bold text-rose-400 tabular-nums">
              {formatRupees(moneyAtRiskPaise)}
            </span>
          </div>

          <div className="hidden sm:block h-6 w-px bg-white/10" />

          {/* Recovered Revenue */}
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Recovered Revenue (24h)
            </span>
            <span className="text-sm font-bold text-emerald-300 tabular-nums">
              {formatRupees(recoveredRevenuePaise)}
            </span>
          </div>

          <div className="hidden sm:block h-6 w-px bg-white/10" />

          {/* Recovery Rate */}
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-cyan-400" />
              Recovery Rate
            </span>
            <span className="text-sm font-bold text-cyan-300 tabular-nums">
              {(recoveryRate * 100).toFixed(1)}%
            </span>
          </div>

          <div className="hidden md:block h-6 w-px bg-white/10" />

          {/* Clock */}
          <div className="hidden md:flex flex-col text-right">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">IST (Asia/Kolkata)</span>
            <span className="text-sm text-slate-300 tabular-nums font-mono">{time || "00:00:00"}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
