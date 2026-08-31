"use client";

import { Check, Lock, Pencil } from "lucide-react";
import React, { useEffect, useState } from "react";
import { formatISTTime } from "@/lib/formatters";
import { useMerchant } from "@/lib/merchant";
import { useApi } from "@/lib/useApi";
import type { MerchantStats, RailHealthMatrix } from "@/types";

const POLL_MS = 10000;

/**
 * The top bar: who we are looking at, whether we can see, and what time it is.
 *
 * The two service indicators are the reason this bar exists. Every panel below
 * reports its own reachability, but an operator arriving at the screen needs to
 * know in one glance whether they are looking at the system or at the last
 * thing the console managed to read. `salvage-core` is probed by the stats
 * endpoint and `salvage-brain` by the sensing endpoint, which are the two reads
 * every other screen depends on.
 *
 * The three figures that used to sit here — ₹3.43L at risk, ₹18.1L recovered,
 * a 53.0% recovery rate — were hardcoded constants that rendered identically on
 * a fresh install with no backend running. What replaced them is counted, and
 * it now lives on the war room where there is room to label it.
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
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-ink-1/80 px-4 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-iris/30 bg-iris/10 font-mono text-[11px] font-bold tracking-tight text-iris">
          SV
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-fg">
            Salvage
          </p>
          <p className="flex items-center gap-1 text-[10px] leading-tight text-fg-faint">
            <Lock className="h-2.5 w-2.5" />
            SHA-256 hash-chained ledger
          </p>
        </div>
      </div>

      <MerchantPicker merchantId={merchantId} onChange={setMerchantId} />

      <div className="ml-auto flex items-center gap-4">
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
    </header>
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
      className={`${reachable ? "state-healthy" : "state-down"} flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-fg-faint uppercase`}
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
 * brand rather than buried in a settings page. There is deliberately no "all
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
        className="group flex items-center gap-1.5 rounded-lg border border-line-strong bg-ink-2 px-2.5 py-1 font-mono text-[11px] text-fg-muted transition-colors hover:border-iris/40 hover:text-fg"
      >
        {merchantId}
        <Pencil className="h-2.5 w-2.5 text-fg-faint group-hover:text-iris" />
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
        className="w-44 rounded-lg border border-iris/50 bg-ink-2 px-2.5 py-1 font-mono text-[11px] text-fg outline-none"
      />
      <button type="submit" aria-label="Apply merchant" className="text-iris">
        <Check className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
