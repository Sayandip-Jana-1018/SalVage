"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Which merchant the console is looking at.
 *
 * Everything salvage-core and salvage-brain serve is tenant-scoped, so the
 * console cannot show anything until it knows whose data to ask for. There is
 * deliberately no "all merchants" view: no endpoint supports one, because
 * reading across tenants is not a query the services can express.
 *
 * The default matches the merchant that `make demo` provisions, so a fresh
 * checkout has something to show immediately after running it.
 */
const STORAGE_KEY = "salvage.console.merchantId";

export const DEFAULT_MERCHANT_ID =
  process.env.NEXT_PUBLIC_DEFAULT_MERCHANT_ID ?? "merch_demo";

export function useMerchant(): {
  merchantId: string;
  setMerchantId: (next: string) => void;
  ready: boolean;
} {
  // Starts at the default on both server and client so the first render
  // matches, then reads localStorage in an effect. Reading storage during
  // render would produce a hydration mismatch.
  const [merchantId, setStored] = useState(DEFAULT_MERCHANT_ID);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setStored(saved);
    } catch {
      // Private windows and blocked site data throw on access. The default is
      // a perfectly good answer, so this is not worth surfacing.
    }
    setReady(true);
  }, []);

  const setMerchantId = useCallback((next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return;
    setStored(trimmed);
    try {
      window.localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      // Preference is lost on reload; the session still works.
    }
  }, []);

  return { merchantId, setMerchantId, ready };
}
