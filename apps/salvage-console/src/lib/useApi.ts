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

export interface PostState<T> {
  phase: "idle" | "loading" | "ready" | "failed";
  data: T | null;
  error: string | null;
  status: number | null;
  run: (body: unknown) => Promise<void>;
  reset: () => void;
}

/**
 * POST a console API route once, on demand.
 *
 * Separate from {@link useApi} because these are actions rather than reads:
 * nothing polls, nothing refreshes, and the caller decides when it happens. The
 * HTTP status is kept alongside the message because the language routes use it
 * to mean different things — 503 is "the layer is switched off", 502 is "the
 * model answered with something that failed validation", 409 is "this code is
 * already mapped" — and a page that collapses those into one red box throws
 * away the most useful part of the refusal.
 */
export function usePostApi<T>(url: string): PostState<T> {
  const [phase, setPhase] = useState<PostState<T>["phase"]>("idle");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setData(null);
    setError(null);
    setStatus(null);
  }, []);

  const run = useCallback(
    async (body: unknown) => {
      setPhase("loading");
      setError(null);
      setStatus(null);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });
        const payload = (await response.json()) as ApiResult<T>;
        setStatus(response.status);
        if (payload.ok) {
          setData(payload.data);
          setPhase("ready");
        } else {
          setError(payload.error);
          setPhase("failed");
        }
      } catch {
        setError("The console could not reach its own API route.");
        setPhase("failed");
      }
    },
    [url],
  );

  return { phase, data, error, status, run, reset };
}
