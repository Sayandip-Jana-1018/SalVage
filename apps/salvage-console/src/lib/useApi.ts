"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiResult } from "@/types";

export type Phase = "loading" | "ready" | "missing" | "unavailable";

/* ---------------------------------------------------------------------------
 * One request per URL, however many components ask.
 *
 * `/api/rails` is read by the header, the connection banner and the rail
 * matrix. Each mounted its own poll, so the war room issued three identical
 * requests every ten seconds -- six in development, where StrictMode mounts
 * every effect twice -- and the server log was a wall of the same line. Three
 * components legitimately need that fact; three round trips to learn it once is
 * just the absence of any shared layer.
 *
 * Two collapsing rules, both deliberately small:
 *
 *   in flight  a second caller for a URL already being fetched joins the
 *              existing promise instead of opening its own.
 *   just done  a result younger than FRESH_MS is handed back directly, which
 *              catches the staggered mounts and StrictMode's second pass.
 *
 * FRESH_MS is far below every poll interval on the site (the shortest is 10s),
 * so this never delays a scheduled refresh -- it only merges the duplicates
 * that were always meant to be one read. Nothing is retained beyond it: this is
 * a request collapser, not a cache, and an operator console must not answer
 * from a store when it could ask.
 * ------------------------------------------------------------------------ */

type Outcome<T> =
  | { phase: "ready"; data: T; error: null }
  | { phase: "missing" | "unavailable"; data: null; error: string };

const FRESH_MS = 1200;

const inFlight = new Map<string, Promise<Outcome<unknown>>>();
const recent = new Map<string, { at: number; outcome: Outcome<unknown> }>();

async function fetchOnce<T>(url: string): Promise<Outcome<T>> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const body = (await response.json()) as ApiResult<T>;
    if (body.ok) return { phase: "ready", data: body.data, error: null };
    return {
      // 404 is the record genuinely not existing; anything else is the console
      // having lost the ability to know. Collapsed here, they would be the same
      // grey box on screen.
      phase: response.status === 404 ? "missing" : "unavailable",
      data: null,
      error: body.error,
    };
  } catch {
    return {
      phase: "unavailable",
      data: null,
      error: "The console could not reach its own API route.",
    };
  }
}

function sharedFetch<T>(url: string, force: boolean): Promise<Outcome<T>> {
  if (force) recent.delete(url);

  const cached = recent.get(url);
  if (cached && Date.now() - cached.at < FRESH_MS) {
    return Promise.resolve(cached.outcome as Outcome<T>);
  }

  const existing = inFlight.get(url);
  if (existing) return existing as Promise<Outcome<T>>;

  const pending = fetchOnce<T>(url)
    .then((outcome) => {
      recent.set(url, { at: Date.now(), outcome: outcome as Outcome<unknown> });
      return outcome as Outcome<unknown>;
    })
    .finally(() => inFlight.delete(url));

  inFlight.set(url, pending);
  return pending as Promise<Outcome<T>>;
}

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

    const run = async (force: boolean) => {
      const outcome = await sharedFetch<T>(url, force);
      if (cancelled || mine !== generation.current) return;

      if (outcome.phase === "ready") {
        setData(outcome.data);
        setError(null);
        setPhase("ready");
        setLastUpdated(new Date());
      } else {
        setError(outcome.error);
        setPhase(outcome.phase);
      }
    };

    // An explicit refresh bypasses the freshness window; a mount or a poll tick
    // is allowed to join whatever is already in flight.
    void run(nonce > 0);
    if (!pollMs) return () => { cancelled = true; };

    const timer = setInterval(() => void run(false), pollMs);
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
