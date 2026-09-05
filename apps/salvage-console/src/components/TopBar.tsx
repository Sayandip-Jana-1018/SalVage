"use client";

import { Check, Lock, Pencil, ShieldCheck, Sparkles } from "lucide-react";
import React, { useEffect, useState } from "react";
import { formatISTTime } from "@/lib/formatters";
import { useMerchant } from "@/lib/merchant";
import { useApi } from "@/lib/useApi";
import type { MerchantStats, RailHealthMatrix } from "@/types";

const POLL_MS = 8000;

export function TopBar(): React.ReactElement {
  const [time, setTime] = useState<string>("");
  const { merchantId, setMerchantId, ready } = useMerchant();

  const core = useApi<MerchantStats>(
    ready ? `/api/stats/${encodeURIComponent(merchantId)}?hours=24` : null,
    POLL_MS,
  );
  const brain = useApi<RailHealthMatrix>("/api/rails", POLL_MS);

  useEffect(() => {
    const tick = () => setTime(formatISTTime(new Date().toISOString()));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="flex justify-center px-4 pt-5 sm:px-6">
      <div className="glass flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3.5 sm:px-6">
        {/* Brand Monogram & Cryptographic Verification Pill */}
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="relative group">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-iris via-cyber-cyan to-healthy opacity-40 blur-sm group-hover:opacity-75 transition duration-500" />
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/25 bg-gradient-to-br from-iris/30 via-ink-2 to-ink-0 font-mono text-[13px] font-extrabold tracking-tight text-white shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)]">
              SV
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="display text-[16px] font-bold tracking-tight">Salvage</p>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-healthy/30 bg-healthy/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-healthy">
                <ShieldCheck className="h-2.5 w-2.5" />
                Live Protection
              </span>
            </div>
            <p className="flex items-center gap-1.5 text-[10px] text-fg-faint font-mono">
              <Lock className="h-2.5 w-2.5 text-iris" />
              SHA-256 Hash-Chained Ledger
            </p>
          </div>
        </div>

        {/* Tenant / Merchant Selector */}
        <div className="flex items-center gap-3">
          <span className="eyebrow hidden md:inline text-[10px]">Tenant:</span>
          <MerchantPicker merchantId={merchantId} onChange={setMerchantId} />
        </div>

        {/* Health Telemetry & Real-Time IST Clock */}
        <div className="flex items-center gap-4">
          <ShortcutHint />

          <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
            <ServiceDot name="core" reachable={core.phase !== "unavailable"} />
            <span className="h-3 w-px bg-white/10" />
            <ServiceDot name="brain" reachable={brain.phase !== "unavailable"} />
          </div>

          <div className="hidden text-right lg:block pl-1">
            <div className="flex items-center gap-1.5 justify-end">
              <span className="h-1.5 w-1.5 rounded-full bg-healthy animate-ping" />
              <p className="eyebrow text-[9.5px]">IST ACTIVE</p>
            </div>
            <p suppressHydrationWarning className="num font-mono text-xs font-semibold text-fg-muted">
              {time || "—"}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

function ShortcutHint(): React.ReactElement {
  const [modifier, setModifier] = useState("Ctrl");

  useEffect(() => {
    const isApple = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
    if (isApple) setModifier("⌘");
  }, []);

  return (
    <span
      suppressHydrationWarning
      title="Open the command palette"
      className="hidden items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[10.5px] text-fg-muted shadow-sm hover:border-iris/40 transition-colors lg:flex"
    >
      <span className="text-iris font-semibold">{modifier}</span>
      <span className="font-semibold text-fg">K</span>
    </span>
  );
}

function ServiceDot({ name, reachable }: { name: string; reachable: boolean }): React.ReactElement {
  return (
    <span
      title={
        reachable
          ? `salvage-${name} connected (<50ms SLA)`
          : `salvage-${name} unreachable`
      }
      className={`${reachable ? "state-healthy" : "state-down"} flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-wider`}
    >
      <span className={`state-dot ${reachable ? "" : "alarm"}`} />
      <span className={reachable ? "text-fg" : "text-down"}>{name}</span>
    </span>
  );
}

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
        title="Click to switch merchant tenant"
        className="group flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-1.5 font-mono text-[11.5px] font-semibold text-fg transition-all duration-300 hover:border-iris/50 hover:bg-iris/[0.08] hover:shadow-[0_0_15px_rgba(99,102,241,0.2)]"
      >
        <span className="text-iris font-bold">#</span>
        <span>{merchantId}</span>
        <Pencil className="h-3 w-3 text-fg-faint transition-colors group-hover:text-iris" />
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
      className="flex items-center gap-1.5"
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
        className="w-44 rounded-xl border border-iris bg-ink-2 px-3 py-1.5 font-mono text-[11.5px] font-semibold text-fg outline-none shadow-[0_0_15px_rgba(99,102,241,0.3)]"
      />
      <button
        type="submit"
        aria-label="Apply merchant"
        className="grid h-7 w-7 place-items-center rounded-lg bg-iris text-ink-0 hover:bg-white transition-colors"
      >
        <Check className="h-4 w-4 stroke-[3]" />
      </button>
    </form>
  );
}
