"use client";

import { Activity, CreditCard, FlaskConical, Languages, Stethoscope } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

/**
 * A centred glass pill, with the active marker sliding between items.
 *
 * The slide is the detail worth the code. Colouring the active tab is a state
 * change with no continuity; moving one lit surface from where it was to where
 * it now is tells the eye that these are positions in one row, and it is the
 * single cheapest thing that makes an interface feel considered.
 *
 * The marker is measured from the DOM rather than computed from an index,
 * because the items have different widths — a fixed 1/5th step would drift.
 * Measurement runs on route change and on resize, and never inside a scroll or
 * pointer handler.
 */

const TABS = [
  { href: "/war-room", name: "War room", icon: Activity },
  { href: "/autopsy", name: "Autopsy", icon: Stethoscope },
  { href: "/checkout", name: "Checkout", icon: CreditCard },
  { href: "/sandbox", name: "Evaluation", icon: FlaskConical },
  { href: "/language", name: "Language", icon: Languages },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/war-room") return pathname === "/" || pathname.startsWith("/war-room");
  return pathname.startsWith(href);
}

export function Navigation(): React.ReactElement {
  const pathname = usePathname();
  const listRef = useRef<HTMLDivElement>(null);
  const [marker, setMarker] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const measure = () => {
      const list = listRef.current;
      if (!list) return;
      const active = list.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) return setMarker(null);
      setMarker({ left: active.offsetLeft, width: active.offsetWidth });
    };

    measure();
    window.addEventListener("resize", measure);
    // Webfonts land after first paint and change the item widths under the
    // marker, so re-measure once they are ready rather than sitting misaligned.
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener("resize", measure);
  }, [pathname]);

  return (
    <nav className="flex justify-center px-4 sm:px-6">
      <div
        ref={listRef}
        className="glass relative flex max-w-full items-center gap-1 overflow-x-auto p-2"
        role="tablist"
        aria-label="Console sections"
      >
        {marker ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-2 rounded-[15px] border border-white/10 bg-white/[0.07] transition-[left,width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ left: marker.left, width: marker.width }}
          />
        ) : null}

        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              data-active={active}
              aria-current={active ? "page" : undefined}
              className={`relative z-10 flex shrink-0 items-center gap-2 rounded-[15px] px-4 py-2.5 text-[13px] font-medium transition-colors duration-300 ${
                active ? "text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              <Icon
                className={`h-4 w-4 transition-colors duration-300 ${
                  active ? "text-iris" : "text-fg-faint"
                }`}
              />
              {tab.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
