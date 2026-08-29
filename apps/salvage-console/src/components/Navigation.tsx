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
    <nav className="w-full flex justify-center py-4 px-4 z-40">
      <div className="bg-white/80 backdrop-blur-2xl rounded-2xl p-1.5 flex flex-wrap items-center justify-center gap-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-200/90">
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
                  ? "bg-slate-900 text-white shadow-sm font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border border-transparent"
              }`}
            >
              <Icon
                className={`w-4 h-4 transition-colors ${
                  isActive ? "text-emerald-400" : "text-slate-500"
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
