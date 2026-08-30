"use client";

import { AlertCircle, Gavel, Lock, PlugZap, ShieldCheck } from "lucide-react";
import React, { useEffect, useState } from "react";
import { formatISTTime } from "@/lib/formatters";
import { useMerchant } from "@/lib/merchant";
import { useApi } from "@/lib/useApi";
import type { MerchantStats } from "@/types";

const POLL_MS = 10000;

/**
 * Header, with counted figures only.
 *
 * The three metrics here were previously hardcoded constants:
 * `moneyAtRiskPaise = 34285000`, `recoveredRevenuePaise = 181000000` and
 * `recoveryRate = 0.53`. They rendered as ₹3.43L at risk, ₹18.1L recovered in
 * 24h, and a 53.0% recovery rate, on every page load, on a fresh install, with
 * no backend running.
 *
 * What is shown now is what salvage-core counted. There is no recovery rate
 * and no recovered-rupees figure, because core cannot establish either yet:
 * confirming a recovery requires observing a later success on the same order
 * inside the attribution window, and the execution path that would record that
 * is not connected to a payment provider. When it is, those tiles come back
 * with real numbers behind them.
 */
export function Header(): React.ReactElement {
  const [time, setTime] = useState<string>("");
  const { merchantId, setMerchantId, ready } = useMerchant();
  const { phase, data } = useApi<MerchantStats>(
    ready ? `/api/stats/${encodeURIComponent(merchantId)}?hours=24` : null,
    POLL_MS,
  );

  useEffect(() => {
    const tick = () => setTime(formatISTTime(new Date().toISOString()));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-2xl sticky top-0 z-50 shadow-[0_4px_25px_rgba(0,0,0,0.03)] py-3 px-4 flex flex-col items-center">
      <div className="max-w-6xl w-full mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
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
              <MerchantPicker merchantId={merchantId} onChange={setMerchantId} />
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> SHA-256 hash-chained ledger
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 font-mono text-xs text-center">
          {phase === "unavailable" ? (
            <div className="flex items-center gap-1.5 text-rose-700">
              <PlugZap className="w-3.5 h-3.5" />
              <span className="text-[11px] font-sans font-medium">
                salvage-core unreachable — figures unavailable
              </span>
            </div>
          ) : (
            <>
              <Metric
                icon={<AlertCircle className="w-3 h-3 text-rose-500" />}
                label="Failures (24h)"
                value={data ? data.failures_observed.toLocaleString("en-IN") : "—"}
                tone="text-rose-600"
              />
              <Divider />
              <Metric
                icon={<ShieldCheck className="w-3 h-3 text-indigo-600" />}
                label="Decisions permitted"
                value={data ? data.decisions_permitted.toLocaleString("en-IN") : "—"}
                tone="text-indigo-600"
              />
              <Divider />
              <Metric
                icon={<Gavel className="w-3 h-3 text-amber-600" />}
                label="Refused by bounds"
                value={data ? data.decisions_refused_by_bounds.toLocaleString("en-IN") : "—"}
                tone="text-amber-700"
              />
            </>
          )}

          <div className="hidden md:block h-6 w-px bg-slate-200" />

          <div className="hidden md:flex flex-col items-center text-center">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-sans font-medium">
              IST (Asia/Kolkata)
            </span>
            <span
              suppressHydrationWarning
              className="text-sm text-slate-700 tabular-nums font-mono font-medium"
            >
              {time || "—"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function Divider(): React.ReactElement {
  return <div className="hidden sm:block h-6 w-px bg-slate-200" />;
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] text-slate-500 uppercase tracking-wider flex items-center gap-1 font-sans font-medium">
        {icon}
        {label}
      </span>
      <span className={`text-sm font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

/** Lets an operator switch tenants. Every backend query is scoped by this. */
function MerchantPicker({
  merchantId,
  onChange,
}: {
  merchantId: string;
  onChange: (next: string) => void;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(merchantId);

  useEffect(() => setDraft(merchantId), [merchantId]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Change merchant"
        className="text-[9px] uppercase font-mono px-2.5 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200 font-bold hover:border-emerald-300 hover:text-emerald-800 transition-colors"
      >
        {merchantId}
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onChange(draft);
        setEditing(false);
      }}
    >
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          onChange(draft);
          setEditing(false);
        }}
        aria-label="Merchant id"
        className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-slate-900 border border-emerald-300 focus:outline-none w-40"
      />
    </form>
  );
}
