"use client";

import { Activity, CreditCard, FlaskConical, Languages, Stethoscope } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

const TABS = [
  { href: "/war-room", name: "War Room", icon: Activity, tint: "text-rose-400" },
  { href: "/autopsy", name: "Autopsy", icon: Stethoscope, tint: "text-cyber-cyan" },
  { href: "/checkout", name: "Checkout & Live Demo", icon: CreditCard, tint: "text-emerald-400" },
  { href: "/sandbox", name: "Evaluation & Benchmarks", icon: FlaskConical, tint: "text-amber-400" },
  { href: "/language", name: "AI Operator Explanations", icon: Languages, tint: "text-iris" },
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
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener("resize", measure);
  }, [pathname]);

  return (
    <nav className="flex justify-center px-4 sm:px-6">
      <div
        ref={listRef}
        className="glass-pill relative flex max-w-full items-center gap-1.5 overflow-x-auto p-2 rounded-2xl"
        role="tablist"
        aria-label="Console sections"
      >
        {marker ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-2 rounded-xl border border-iris/40 bg-gradient-to-r from-iris/20 to-cyber-cyan/15 shadow-[0_0_20px_rgba(99,102,241,0.25)] transition-[left,width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
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
              className={`relative z-10 flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-semibold transition-all duration-300 ${
                active
                  ? "text-white shadow-sm"
                  : "text-fg-muted hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Icon
                className={`h-4 w-4 transition-all duration-300 ${
                  active ? `${tab.tint} scale-110 drop-shadow-[0_0_8px_currentColor]` : "text-fg-faint"
                }`}
              />
              <span>{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
