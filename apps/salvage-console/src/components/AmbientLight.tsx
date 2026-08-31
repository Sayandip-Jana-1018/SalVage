"use client";

import { useEffect } from "react";

/**
 * A highlight that follows the cursor across the fixed background layer.
 *
 * Parallax without moving anything. The handler writes two CSS custom
 * properties on `:root` and `.atmosphere` uses them as a gradient centre, so
 * the browser repaints one already-composited layer and no element in the tree
 * is touched, laid out or re-rendered. React never sees a state change.
 *
 * Throttled to one write per animation frame. A raw mousemove listener fires
 * far faster than the display refreshes, and the extra writes are work whose
 * result is overwritten before anything draws it.
 *
 * Skipped entirely for a viewer who has asked for reduced motion, and for
 * coarse pointers — on a touch screen there is no cursor to follow, and the
 * listener would only ever fire on a tap.
 */
export function AmbientLight(): null {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduced || coarse) return;

    let frame = 0;
    let pending: { x: number; y: number } | null = null;

    const paint = () => {
      frame = 0;
      if (!pending) return;
      const root = document.documentElement;
      root.style.setProperty("--mx", String(pending.x));
      root.style.setProperty("--my", String(pending.y));
      pending = null;
    };

    const onMove = (event: MouseEvent) => {
      pending = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
