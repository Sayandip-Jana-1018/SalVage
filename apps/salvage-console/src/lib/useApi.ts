"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResult } from "@/types";

export type Phase = "loading" | "ready" | "missing" | "unavailable";

export interface ApiState<T> {
  phase: Phase;
  data: T | null;
  error: string | null;
  /** Populated once, then kept across refreshes so a poll blip does not blank the screen. */
  lastUpdated: Date | null;
  refresh: () => void;
}

/**
 * Fetch a console API route, keeping the four outcomes distinct.
 *
 * `missing` and `unavailable` are separate states and the UI renders them
 * differently. A screen that shows an empty table for both is telling an
 * operator "there are no incidents" at the exact moment it has lost the
 * ability to know whether there are incidents.
 *
 * On a polling refresh the previous data is retained while the new request is
 * in flight, so a transient failure surfaces as a stale-data warning rather
 * than as the dashboard emptying itself.
 */
export function useApi<T>(url: string | null, pollMs?: number): ApiState<T> {
  const [phase, setPhase] = useState<Phase>(url ? "loading" : "missing");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nonce, setNonce] = useState(0);

  // Guards against a slow earlier request resolving after a newer one and
  // overwriting fresher data, which shows up as the UI flickering backwards.
  const generation = useRef(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!url) return;
    const mine = ++generation.current;
    let cancelled = false;

    const run = async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        const body = (await response.json()) as ApiResult<T>;
        if (cancelled || mine !== generation.current) return;

        if (body.ok) {
          setData(body.data);
          setError(null);
          setPhase("ready");
          setLastUpdated(new Date());
        } else if (response.status === 404) {
          setError(body.error);
          setPhase("missing");
        } else {
          setError(body.error);
          setPhase("unavailable");
        }
      } catch {
        if (cancelled || mine !== generation.current) return;
        setError("The console could not reach its own API route.");
        setPhase("unavailable");
      }
    };

    void run();
    if (!pollMs) return () => { cancelled = true; };

    const timer = setInterval(run, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [url, pollMs, nonce]);

  return { phase, data, error, lastUpdated, refresh };
}
