"use client";

import {
  Activity,
  CreditCard,
  FlaskConical,
  Languages,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

/**
 * Navigation.
 *
 * A fixed left rail above `lg` and a horizontal strip below it. Both render the
 * same list from the same array, because two navigations that can disagree
 * about what exists is a bug waiting for a new page to be added.
 *
 * The rail is where a dashboard puts navigation. The version this replaces was
 * a centred pill bar under a centred header, which is a landing-page shape: it
 * spends the top third of a 1080p screen on chrome and pushes the rail matrix —
 * the thing an operator is here to look at — below the fold.
 */

const TABS = [
  {
    href: "/war-room",
    name: "War room",
    icon: Activity,
    blurb: "Live rail health, incidents, ledger",
  },
  {
    href: "/autopsy",
    name: "Autopsy",
    icon: Stethoscope,
    blurb: "One attempt, end to end",
  },
  {
    href: "/checkout",
    name: "Checkout",
    icon: CreditCard,
    blurb: "Publish a failure, follow the pipeline",
  },
  {
    href: "/sandbox",
    name: "Evaluation",
    icon: FlaskConical,
    blurb: "Off-policy results from make eval",
  },
  {
    href: "/language",
    name: "Language layer",
    icon: Languages,
    blurb: "Where an LLM is allowed to help",
  },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/war-room") return pathname === "/" || pathname.startsWith("/war-room");
  return pathname.startsWith(href);
}

export function Sidebar(): React.ReactElement {
  const pathname = usePathname();

  return (
    <>
      <nav className="hidden w-[228px] shrink-0 flex-col gap-0.5 border-r border-line bg-ink-1/60 px-3 py-4 lg:flex">
        <p className="eyebrow px-2 pb-2">Console</p>
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`group relative flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${
                active ? "bg-ink-3 text-fg" : "text-fg-muted hover:bg-ink-2 hover:text-fg"
              }`}
            >
              {active ? (
                <span className="absolute left-0 top-2 h-[calc(100%-1rem)] w-0.5 rounded-full bg-iris" />
              ) : null}
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-iris" : "text-fg-faint group-hover:text-fg-muted"}`}
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium leading-tight">{tab.name}</span>
                <span className="mt-0.5 block text-[10.5px] leading-tight text-fg-faint">
                  {tab.blurb}
                </span>
              </span>
            </Link>
          );
        })}

        <div className="mt-auto px-2 pt-6">
          <p className="text-[10.5px] leading-relaxed text-fg-faint">
            Every figure on these screens is counted by a service. Where one cannot be
            counted, the console shows an em-dash and says why.
          </p>
        </div>
      </nav>

      <nav className="flex gap-1 overflow-x-auto border-b border-line bg-ink-1/60 px-3 py-2 lg:hidden">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                active ? "bg-ink-3 text-fg" : "text-fg-muted hover:text-fg"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${active ? "text-iris" : "text-fg-faint"}`} />
              {tab.name}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
