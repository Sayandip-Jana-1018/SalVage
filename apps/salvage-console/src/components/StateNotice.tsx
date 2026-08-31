"use client";

import { AlertTriangle, Inbox, PlugZap } from "lucide-react";
import React from "react";
import { LoadingBar } from "@/components/ui/Primitives";
import type { Phase } from "@/lib/useApi";

/**
 * What a panel shows when it has nothing to draw.
 *
 * It exists because "nothing happened" and "we cannot see" must not look the
 * same. An empty rail matrix rendered identically in both cases would tell an
 * operator every rail is fine at the precise moment the console has lost sight
 * of them.
 *
 * The `unavailable` variant is deliberately quiet — one line, muted, no icon
 * the size of a warning sign. It used to be a full-width alarm block, which was
 * right for one panel and wrong for a page: with the stack down, four panels
 * each rendered the identical alarm and the screen read as broken software
 * rather than as absent data. The explanation now lives once, at the top of the
 * page, in `ConnectionBanner`. What stays here is the fact that *this* panel
 * cannot see, which is still a fact this panel owns.
 */
export function StateNotice({
  phase,
  error,
  emptyTitle,
  emptyBody,
}: {
  phase: Exclude<Phase, "ready">;
  error?: string | null;
  emptyTitle?: string;
  emptyBody?: string;
}): React.ReactElement {
  if (phase === "loading") {
    return (
      <div className="px-6 py-12">
        <div className="mx-auto max-w-xs">
          <LoadingBar />
          <p className="mt-3 text-center font-mono text-[11px] text-fg-faint">
            reading from the services
          </p>
        </div>
      </div>
    );
  }

  if (phase === "unavailable") {
    return (
      <div className="flex items-start justify-center gap-2.5 px-6 py-10 text-center">
        <PlugZap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-faint" />
        <p className="max-w-md text-[12px] leading-relaxed text-fg-faint">
          This panel has no reading. Not an all-clear — the console cannot see what it would
          otherwise be showing.
          {error ? (
            <span className="mt-1 block font-mono text-[11px] text-fg-faint/70">{error}</span>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04]">
        <Inbox className="h-4 w-4 text-fg-faint" />
      </span>
      <p className="text-[13px] font-medium text-fg">{emptyTitle ?? "Nothing recorded yet"}</p>
      <p className="max-w-md text-[12px] leading-relaxed text-fg-muted">
        {emptyBody ?? "The services answered, and they have nothing to show for this query."}
      </p>
    </div>
  );
}

/** Data that is older than it should be, marked as such rather than silently shown. */
export function StaleBanner({ error }: { error: string }): React.ReactElement {
  return (
    <div className="state-degraded mb-3 flex items-start gap-2 rounded-xl border border-degraded/25 bg-degraded/[0.07] px-3.5 py-2.5">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-degraded" />
      <span className="font-mono text-[11px] leading-relaxed text-degraded">
        Showing the last successful read. Refresh failed: {error}
      </span>
    </div>
  );
}
