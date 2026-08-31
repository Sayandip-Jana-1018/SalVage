"use client";

import { PlugZap } from "lucide-react";
import React from "react";
import { useMerchant } from "@/lib/merchant";
import { useApi } from "@/lib/useApi";
import type { MerchantStats, RailHealthMatrix } from "@/types";

const POLL_MS = 10000;

/**
 * One banner when the stack is not running, instead of the same message
 * repeated down the page.
 *
 * This exists because of a screenshot. With no backends up, the war room
 * rendered four panels each carrying the identical full-size "Backend
 * unreachable" block — the same icon, the same sentence, the same `make up`
 * hint, four times. The information was correct and the screen looked broken,
 * which is its own kind of wrong: a reader cannot tell "four things failed"
 * from "one thing failed and four panels noticed".
 *
 * So the explanation is hoisted here and said once, with the fix. The panels
 * below keep their own unavailable state — they must, because "this panel
 * cannot see" is still a fact each panel owns — but it is now a single quiet
 * line rather than a full-width alarm.
 *
 * The two probes are the same reads every other screen depends on: telemetry
 * for salvage-core, sensing for salvage-brain. They are polled here anyway by
 * the header, and `useApi` deduplicates nothing — but these are two small
 * requests every ten seconds against a service that is either up or not, which
 * is a price worth paying to avoid threading state through the whole tree.
 */
export function ConnectionBanner(): React.ReactElement | null {
  const { merchantId, ready } = useMerchant();

  const core = useApi<MerchantStats>(
    ready ? `/api/stats/${encodeURIComponent(merchantId)}?hours=24` : null,
    POLL_MS,
  );
  const brain = useApi<RailHealthMatrix>("/api/rails", POLL_MS);

  const down: string[] = [];
  if (core.phase === "unavailable") down.push("salvage-core");
  if (brain.phase === "unavailable") down.push("salvage-brain");

  // Nothing to say while the first read is still in flight; a banner that
  // flashes on every page load would be noise rather than a signal.
  if (down.length === 0) return null;

  // A rejected API key is a different problem with a different fix, and saying
  // "start the stack" to somebody whose stack is running would send them the
  // wrong way. The route handlers already distinguish the two.
  const credential = [core.error, brain.error].some(
    (message) => message?.includes("API key") ?? false,
  );

  return (
    <div className="state-down state-tile pop flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <span className="flex items-center gap-2.5">
        <PlugZap className="h-4 w-4 shrink-0 text-down" />
        <span className="text-[13px] font-semibold text-down">
          {down.length === 2 ? "The services are not running" : `${down[0]} is unreachable`}
        </span>
      </span>

      <p className="text-[12px] leading-relaxed text-fg-muted sm:ml-2">
        {credential ? (
          <>
            The console reached {down.join(" and ")} and its API key was refused. Check{" "}
            <Code>SALVAGE_API_KEY</Code> against that service&apos;s <Code>SALVAGE_API_KEYS</Code>.
          </>
        ) : (
          <>
            Nothing below is a measurement — the panels are showing what they last read, or
            nothing at all. Start the stack with <Code>make up</Code>, then <Code>make demo</Code>{" "}
            to put a payment through it.
          </>
        )}
      </p>

      <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
        retrying every {POLL_MS / 1000}s
      </span>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <code className="rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-fg">
      {children}
    </code>
  );
}
