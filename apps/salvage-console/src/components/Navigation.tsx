"use client";

import { Activity, FlaskConical, Stethoscope } from "lucide-react";
import Link from "next/link.js";
import { usePathname } from "next/navigation.js";

export function Navigation() {
  const pathname = usePathname();

  const tabs = [
    {
      name: "The War Room",
      href: "/war-room",
      icon: Activity,
      description: "Live health matrix & failure feed",
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
    <nav className="border-b border-slate-800/60 bg-[#090c12]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 py-2">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href === "/war-room" && pathname === "/");
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? "bg-slate-800/90 text-slate-100 border border-slate-700/60 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-emerald-400" : "text-slate-400"}`} />
              <span>{tab.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
