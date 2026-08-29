"use client";

import {
  Activity,
  CreditCard,
  FlaskConical,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

export function Navigation(): React.ReactElement {
  const pathname = usePathname();

  const tabs = [
    {
      name: "The War Room",
      href: "/war-room",
      icon: Activity,
      description: "Live health matrix & failure feed",
    },
    {
      name: "Live Checkout & Pay",
      href: "/checkout",
      icon: CreditCard,
      description: "Interactive In-App Payment & Recovery Demo",
    },
    {
      name: "The Autopsy",
      href: "/autopsy",
      icon: Stethoscope,
      description: "Single-failure causal dissection",
    },
    {
      name: "Policy Sandbox",
      href: "/sandbox",
      icon: FlaskConical,
      description: "Off-policy counterfactual simulation",
    },
  ];

  return (
    <nav className="w-full flex justify-center py-3 px-4 z-40">
      <div className="liquid-glass rounded-2xl p-1.5 flex flex-wrap items-center justify-center gap-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/10">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href ||
            (tab.href === "/war-room" && pathname === "/");
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-300 ${
                isActive
                  ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/10 text-white border border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.2)] font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
              }`}
            >
              <Icon
                className={`w-4 h-4 transition-colors ${
                  isActive ? "text-emerald-400" : "text-slate-400"
                }`}
              />
              <span>{tab.name}</span>
              {isActive && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
