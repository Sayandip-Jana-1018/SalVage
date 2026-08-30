"use client";

import { Zap } from "lucide-react";
import React from "react";
import { StaleBanner, StateNotice } from "@/components/StateNotice";
import { formatPercent } from "@/lib/formatters";
import { useApi } from "@/lib/useApi";
import type { RailHealthMatrix as Matrix, RailHealthView } from "@/types";

const POLL_MS = 5000;

/**
 * The live sensing matrix, built from whatever rails the brain has observed.
 *
 * The grid is derived from the data rather than declared. The previous version
 * hardcoded four issuer names -- "HDFC Bank", "State Bank of India", "ICICI
 * Bank", "Axis Bank" -- and looked each one up in a checked-in fixture that
 * gave, for instance, State Bank of India an 88.4% one-minute error rate. That
 * is an invented statistic about a real, named institution, which
 * docs/adr/0006-numbers-policy.md forbids outright: a reader who sees SBI's
 * real numbers on their own dashboard every morning would reach this screen
 * and stop believing the rest of the repository.
 *
 * Rail identifiers now come from the sensing service, which derives them from
 * ingested events. Whatever issuers are actually flowing through the system
 * are the issuers that appear here.
 */
export function RailHealthMatrix(): React.ReactElement {
  const { phase, data, error } = useApi<Matrix>("/api/rails", POLL_MS);

  const rails = data?.rails ?? [];
  const issuers = Array.from(new Set(rails.map((r) => splitRail(r).issuer))).sort();
  const methods = Array.from(new Set(rails.map((r) => splitRail(r).method))).sort();

  return (
    <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 text-center flex flex-col items-center">
      <div className="flex flex-col items-center justify-center mb-6 space-y-1">
        <h2 className="text-base sm:text-lg font-serif font-bold text-slate-900 flex items-center justify-center gap-2">
          <Zap className="w-4 h-4 text-emerald-600" />
          Rail Sensing Matrix
        </h2>
        <p className="text-xs text-slate-500 max-w-lg">
          Five-minute sliding-window health, aggregated across every ingested merchant stream
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2 text-xs font-mono">
          <Legend dot="bg-emerald-500" bg="bg-emerald-50" border="border-emerald-200" text="text-emerald-800" label="Healthy" />
          <Legend dot="bg-amber-500" bg="bg-amber-50" border="border-amber-200" text="text-amber-800" label="Degraded" />
          <Legend dot="bg-rose-500 animate-pulse" bg="bg-rose-50" border="border-rose-200" text="text-rose-800" label="Down" />
        </div>

        {data && (
          <p className="text-[10px] font-mono text-slate-400 pt-1">
            {rails.length} rail{rails.length === 1 ? "" : "s"} observed · sensed{" "}
            {new Date(data.timestamp).toLocaleTimeString()}
          </p>
        )}
      </div>

      {phase !== "ready" && !data ? (
        <StateNotice
          phase={phase}
          error={error}
          emptyTitle="No rails observed yet"
          emptyBody="The sensing tracker builds this matrix from ingested payment failures. Once events flow, rails appear here on their own."
        />
      ) : (
        <div className="w-full">
          {phase === "unavailable" && error && <StaleBanner error={error} />}
          {rails.length === 0 ? (
            <StateNotice
              phase="missing"
              emptyTitle="No rails observed yet"
              emptyBody="The services are up and reporting an empty matrix. No payment failures have been ingested."
            />
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 px-4 font-semibold text-center">Issuer</th>
                    {methods.map((m) => (
                      <th key={m} className="pb-3 px-4 font-semibold text-center">
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                  {issuers.map((issuer) => (
                    <tr key={issuer} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-4 font-sans font-bold text-slate-900 text-xs sm:text-sm text-center">
                        {issuer}
                      </td>
                      {methods.map((method) => {
                        const cell = rails.find((r) => {
                          const parts = splitRail(r);
                          return parts.issuer === issuer && parts.method === method;
                        });
                        if (!cell) {
                          return (
                            <td key={method} className="py-3.5 px-4 text-slate-300 text-center">
                              <span title="This issuer carries no traffic on this method">—</span>
                            </td>
                          );
                        }
                        return (
                          <td key={method} className="py-2.5 px-2">
                            <RailCell cell={cell} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RailCell({ cell }: { cell: RailHealthView }): React.ReactElement {
  const color = styleFor(cell.state);
  return (
    <div
      className={`rounded-2xl border p-3.5 flex flex-col items-center justify-center gap-1.5 transition-all duration-300 ${color.bg} ${color.border} hover:shadow-md hover:scale-[1.02] text-center`}
    >
      <div className="flex items-center justify-center gap-2 w-full">
        <span
          className={`w-2 h-2 rounded-full ${color.dot} ${cell.state === "DOWN" ? "animate-ping" : ""}`}
        />
        <span className={`text-[11px] font-bold ${color.text}`}>{cell.state}</span>
      </div>

      <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-700">
        <span className="text-slate-500">5m success:</span>
        <span className="font-bold tabular-nums">{formatPercent(cell.success_rate_5m)}</span>
      </div>

      <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
        <span>failure velocity</span>
        <span className="font-bold tabular-nums">{cell.failure_velocity_5m.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Legend({
  dot,
  bg,
  border,
  text,
  label,
}: {
  dot: string;
  bg: string;
  border: string;
  text: string;
  label: string;
}): React.ReactElement {
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${bg} border ${border} ${text} text-[10px] font-semibold shadow-sm`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span>{label}</span>
    </div>
  );
}

/**
 * Split `issuer|method|provider` into parts.
 *
 * Matches `PaymentFailedEvent.railId()` in salvage-core. A rail id that does
 * not follow the shape is shown whole rather than silently mangled, because a
 * malformed identifier is worth seeing.
 */
function splitRail(rail: RailHealthView): { issuer: string; method: string } {
  const [issuer, method] = rail.rail_id.split("|");
  if (!issuer || !method) return { issuer: rail.rail_id, method: "—" };
  return { issuer, method: method.toUpperCase() };
}

function styleFor(state: string) {
  switch (state) {
    case "HEALTHY":
      return { bg: "bg-emerald-50/70", border: "border-emerald-200/80", text: "text-emerald-800", dot: "bg-emerald-500" };
    case "DEGRADED":
      return { bg: "bg-amber-50/70", border: "border-amber-200/80", text: "text-amber-800", dot: "bg-amber-500" };
    case "DOWN":
      return { bg: "bg-rose-50/70", border: "border-rose-200/80", text: "text-rose-800", dot: "bg-rose-500" };
    default:
      return { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", dot: "bg-slate-400" };
  }
}
