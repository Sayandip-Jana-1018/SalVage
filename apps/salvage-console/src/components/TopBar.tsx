"use client";

import { Check, Lock, Pencil } from "lucide-react";
import React, { useEffect, useState } from "react";
import { formatISTTime } from "@/lib/formatters";
import { useMerchant } from "@/lib/merchant";
import { useApi } from "@/lib/useApi";
import type { MerchantStats, RailHealthMatrix } from "@/types";

const POLL_MS = 10000;

/**
 * The header: who we are looking at, whether we can see, and what time it is.
 *
 * The two service indicators are why this bar exists. Every panel reports its
 * own reachability, but somebody arriving at the screen needs to know in one
 * glance whether they are looking at the system or at the last thing the
 * console managed to read.
 *
 * The three figures that used to sit here — ₹3.43L at risk, ₹18.1L recovered, a
 * 53.0% recovery rate — were hardcoded constants that rendered identically on a
 * fresh install with no backend running. What replaced them is counted, and it
 * lives on the war room where there is room to label it.
 */
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
    <header className="flex justify-center px-4 pt-5">
      <div className="glass flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-iris/25 bg-gradient-to-br from-iris/25 to-iris/5 font-mono text-[12px] font-bold tracking-tight text-iris shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
            SV
          </span>
          <div className="min-w-0">
            <p className="display text-[15px] font-semibold leading-tight">Salvage</p>
            <p className="flex items-center gap-1 text-[10px] leading-tight text-fg-faint">
              <Lock className="h-2.5 w-2.5" />
              SHA-256 hash-chained ledger
            </p>
          </div>
        </div>

        <MerchantPicker merchantId={merchantId} onChange={setMerchantId} />

        <div className="ml-auto flex items-center gap-4">
          <ShortcutHint />

          <div className="hidden items-center gap-3 sm:flex">
            <ServiceDot name="core" reachable={core.phase !== "unavailable"} />
            <ServiceDot name="brain" reachable={brain.phase !== "unavailable"} />
          </div>

          <div className="hidden text-right md:block">
            <p className="eyebrow">IST</p>
            <p suppressHydrationWarning className="num font-mono text-xs text-fg-muted">
              {time || "—"}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

/** The ⌘K hint, with the modifier the viewer's own keyboard actually uses. */
function ShortcutHint(): React.ReactElement {
  const [modifier, setModifier] = useState("Ctrl");

  useEffect(() => {
    // navigator is not available while rendering on the server, and guessing
    // would show a Mac user Ctrl on first paint.
    const isApple = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
    if (isApple) setModifier("⌘");
  }, []);

  return (
    <span
      suppressHydrationWarning
      title="Open the command palette"
      className="hidden items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-fg-faint lg:flex"
    >
      <span>{modifier}</span>
      <span>K</span>
    </span>
  );
}

/**
 * Reachability, not health.
 *
 * A green dot here means the console got an answer, and nothing more. It does
 * not mean the rails are fine, which is why it is labelled with the service
 * name rather than with a word like "operational".
 */
function ServiceDot({ name, reachable }: { name: string; reachable: boolean }): React.ReactElement {
  return (
    <span
      title={
        reachable
          ? `salvage-${name} answered the console's last read`
          : `the console could not reach salvage-${name}`
      }
      className={`${reachable ? "state-healthy" : "state-down"} flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-faint`}
    >
      <span className={`state-dot ${reachable ? "" : "alarm"}`} />
      {name}
    </span>
  );
}

/**
 * Which tenant the console is reading.
 *
 * Every query the backends serve is scoped by this, so it belongs beside the
 * brand rather than in a settings page. There is deliberately no "all
 * merchants" option: no endpoint supports one, because reading across tenants
 * is not a query these services can express.
 */
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
        title="Change merchant. Every backend query is scoped by this."
        className="group flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] text-fg-muted transition-all duration-300 hover:border-iris/40 hover:bg-white/[0.07] hover:text-fg"
      >
        {merchantId}
        <Pencil className="h-2.5 w-2.5 text-fg-faint transition-colors group-hover:text-iris" />
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
      className="flex items-center gap-1"
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
        className="w-44 rounded-xl border border-iris/50 bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] text-fg outline-none"
      />
      <button type="submit" aria-label="Apply merchant" className="text-iris">
        <Check className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
