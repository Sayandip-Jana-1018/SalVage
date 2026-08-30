"use client";

import { AlertTriangle, Inbox, Loader2, PlugZap } from "lucide-react";
import React from "react";
import type { Phase } from "@/lib/useApi";

/**
 * The panel shown when there is no data to draw.
 *
 * It exists because "nothing happened" and "we cannot see" must not look the
 * same. An empty rail matrix rendered identically in both cases would tell an
 * operator every rail is fine at the precise moment the console has lost
 * sight of them.
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
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        <p className="text-xs font-mono">Reading from the services…</p>
      </div>
    );
  }

  if (phase === "unavailable") {
    return (
      <div className="flex flex-col items-center justify-center gap-2.5 py-10 px-6 text-center">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-rose-50 border border-rose-200">
          <PlugZap className="w-5 h-5 text-rose-600" />
        </div>
        <p className="text-sm font-semibold text-rose-800">Backend unreachable</p>
        <p className="text-xs text-slate-600 max-w-md font-mono">
          {error ?? "A service did not respond."}
        </p>
        <p className="text-[11px] text-slate-500 max-w-md">
          This is not an all-clear. The console cannot see the system right now, so nothing
          below should be read as the current state. Start the stack with{" "}
          <code className="px-1 py-0.5 rounded bg-slate-100 font-mono">make up</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-10 px-6 text-center">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-50 border border-slate-200">
        <Inbox className="w-5 h-5 text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-800">{emptyTitle ?? "Nothing recorded yet"}</p>
      <p className="text-xs text-slate-600 max-w-md">
        {emptyBody ?? "The services answered, and they have nothing to show for this query."}
      </p>
    </div>
  );
}

/** A small banner marking data that is older than it should be. */
export function StaleBanner({ error }: { error: string }): React.ReactElement {
  return (
    <div className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
      <span className="font-mono">
        Showing the last successful read. Refresh failed: {error}
      </span>
    </div>
  );
}
