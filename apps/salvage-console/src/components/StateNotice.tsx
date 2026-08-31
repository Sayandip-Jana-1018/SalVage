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
 * of them — so `missing` is slate and quiet, `unavailable` is rose and says
 * outright that nothing below should be read as the current state.
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
      <div className="px-5 py-10">
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
      <div className="state-down flex flex-col items-start gap-3 px-5 py-8">
        <div className="flex items-center gap-2.5">
          <PlugZap className="h-4 w-4 text-down" />
          <p className="text-sm font-semibold text-down">Backend unreachable</p>
        </div>
        <p className="max-w-xl font-mono text-[11px] text-fg-muted">
          {error ?? "A service did not respond."}
        </p>
        <p className="max-w-xl text-xs leading-relaxed text-fg-faint">
          This is not an all-clear. The console cannot see the system right now, so nothing on
          this panel should be read as the current state. Start the stack with{" "}
          <code className="rounded bg-ink-3 px-1.5 py-0.5 font-mono text-fg-muted">make up</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2.5 px-5 py-8">
      <div className="flex items-center gap-2.5">
        <Inbox className="h-4 w-4 text-fg-faint" />
        <p className="text-sm font-medium text-fg">{emptyTitle ?? "Nothing recorded yet"}</p>
      </div>
      <p className="max-w-xl text-xs leading-relaxed text-fg-muted">
        {emptyBody ?? "The services answered, and they have nothing to show for this query."}
      </p>
    </div>
  );
}

/** Data that is older than it should be, marked as such rather than silently shown. */
export function StaleBanner({ error }: { error: string }): React.ReactElement {
  return (
    <div className="state-degraded mb-3 flex items-start gap-2 rounded-lg border border-degraded/30 bg-degraded/[0.07] px-3 py-2">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-degraded" />
      <span className="font-mono text-[11px] leading-relaxed text-degraded">
        Showing the last successful read. Refresh failed: {error}
      </span>
    </div>
  );
}
