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
    <header className="w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-2xl sticky top-0 z-50 shadow-[0_4px_25px_rgba(0,0,0,0.03)] py-3 px-4 flex flex-col items-center">
      <div className="max-w-6xl w-full mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand & Status */}
        <div className="flex items-center gap-3">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl blur opacity-30 group-hover:opacity-70 transition duration-500" />
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center font-serif font-bold text-base shadow-sm">
              SV
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-serif font-bold text-slate-900 text-base tracking-tight">
                SALVAGE
              </span>
              <span className="text-[9px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold flex items-center gap-1 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                AUTONOMOUS ENGINE
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
              <span>v1.4.0</span>
              <span>·</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> SHA-256 AUDITED
              </span>
            </div>
          </div>
        </div>

        {/* Global Key Metrics Ticker - Center Balanced */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 font-mono text-xs text-center">
          {/* Money at Risk */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1 font-sans font-medium">
              <AlertCircle className="w-3 h-3 text-rose-500" />
              Money at Risk
            </span>
            <span className="text-sm font-bold text-rose-600 tabular-nums">
              {formatRupees(moneyAtRiskPaise)}
            </span>
          </div>

          <div className="hidden sm:block h-6 w-px bg-slate-200" />

          {/* Recovered Revenue */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1 font-sans font-medium">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Recovered (24h)
            </span>
            <span className="text-sm font-bold text-emerald-600 tabular-nums">
              {formatRupees(recoveredRevenuePaise)}
            </span>
          </div>

          <div className="hidden sm:block h-6 w-px bg-slate-200" />

          {/* Recovery Rate */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1 font-sans font-medium">
              <ShieldCheck className="w-3 h-3 text-indigo-600" />
              Recovery Rate
            </span>
            <span className="text-sm font-bold text-indigo-600 tabular-nums">
              {(recoveryRate * 100).toFixed(1)}%
            </span>
          </div>

          <div className="hidden md:block h-6 w-px bg-slate-200" />

          {/* Clock */}
          <div className="hidden md:flex flex-col items-center text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-sans font-medium">
              IST (Asia/Kolkata)
            </span>
            <span
              suppressHydrationWarning
              className="text-sm text-slate-700 tabular-nums font-mono font-medium"
            >
              {time || "14:02:11"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
