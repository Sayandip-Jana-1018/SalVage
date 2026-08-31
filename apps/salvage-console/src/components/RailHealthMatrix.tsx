"use client";

import React from "react";
import { StaleBanner, StateNotice } from "@/components/StateNotice";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { StateDot } from "@/components/ui/Primitives";
import { formatAge, formatPercent, stateClass } from "@/lib/formatters";
import { useApi } from "@/lib/useApi";
import type { RailHealthMatrix as Matrix, RailHealthView } from "@/types";

const POLL_MS = 5000;

/**
 * The sensing matrix: issuers down the side, methods across the top.
 *
 * The grid is derived from the data rather than declared. The version this
 * replaces hardcoded four issuer names — "HDFC Bank", "State Bank of India",
 * "ICICI Bank", "Axis Bank" — and looked each one up in a checked-in fixture
 * that gave, for instance, State Bank of India an 88.4% one-minute error rate.
 * That is an invented statistic about a real, named institution, which
 * docs/adr/0006-numbers-policy.md forbids outright.
 *
 * Rail identifiers come from the sensing service, which derives them from
 * ingested events. Whatever issuers actually flow through the system are the
 * issuers that appear here.
 */
export function RailHealthMatrix(): React.ReactElement {
  const { phase, data, error } = useApi<Matrix>("/api/rails", POLL_MS);

  const rails = data?.rails ?? [];
  const issuers = [...new Set(rails.map((rail) => splitRail(rail.rail_id).issuer))].sort();
  const methods = [...new Set(rails.map((rail) => splitRail(rail.rail_id).method))].sort();

  return (
    <Panel index={2}>
      <PanelHeader
        eyebrow="Five-minute sliding window"
        title="Rail sensing matrix"
        note="Aggregated across every ingested merchant stream. A cell is one issuer on one method; a dash means that issuer carries no traffic on that method."
        right={
          data ? (
            <div className="text-right">
              <p className="num font-mono text-[11px] text-fg-muted">
                {rails.length} rail{rails.length === 1 ? "" : "s"}
              </p>
              <p className="font-mono text-[10px] text-fg-faint">{formatAge(data.timestamp)}</p>
            </div>
          ) : null
        }
      />

      {phase !== "ready" && !data ? (
        <StateNotice
          phase={phase}
          error={error}
          emptyTitle="No rails observed yet"
          emptyBody="The sensing tracker builds this matrix from ingested payment failures. Once events flow, rails appear here on their own."
        />
      ) : rails.length === 0 ? (
        <StateNotice
          phase="missing"
          emptyTitle="No rails observed yet"
          emptyBody="The services are up and reporting an empty matrix. No payment failures have been ingested."
        />
      ) : (
        <PanelBody className="!px-0 !py-0">
          {phase === "unavailable" && error ? (
            <div className="px-5 pt-4">
              <StaleBanner error={error} />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-5 py-3">
            {(["HEALTHY", "DEGRADED", "DOWN"] as const).map((state) => (
              <span
                key={state}
                className={`${stateClass(state)} flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-faint`}
              >
                <StateDot state={state} />
                {state.toLowerCase()}
              </span>
            ))}
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  <th className="eyebrow sticky left-0 z-10 bg-[#0d101b] px-5 py-2.5 text-left">
                    Issuer
                  </th>
                  {methods.map((method) => (
                    <th key={method} className="eyebrow px-3 py-2.5 text-left">
                      {method}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {issuers.map((issuer) => (
                  <tr key={issuer}>
                    <td className="sticky left-0 z-10 bg-[#0d101b] px-5 py-2 font-mono text-xs text-fg">
                      {issuer}
                    </td>
                    {methods.map((method) => {
                      const cell = rails.find((rail) => {
                        const parts = splitRail(rail.rail_id);
                        return parts.issuer === issuer && parts.method === method;
                      });
                      return (
                        <td key={method} className="px-3 py-2">
                          {cell ? (
                            <RailCell cell={cell} />
                          ) : (
                            <span
                              title="This issuer carries no traffic on this method"
                              className="font-mono text-xs text-fg-faint/50"
                            >
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelBody>
      )}
    </Panel>
  );
}

function RailCell({ cell }: { cell: RailHealthView }): React.ReactElement {
  return (
    <div
      className={`${stateClass(cell.state)} state-tile min-w-[9rem] rounded-lg px-2.5 py-2`}
      title={`${cell.rail_id} · evaluated ${formatAge(cell.last_evaluated_at)}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <StateDot state={cell.state} />
          <span className="state-text font-mono text-[10px] font-semibold uppercase tracking-wider">
            {cell.state}
          </span>
        </span>
        <span className="num font-mono text-xs font-semibold text-fg">
          {formatPercent(cell.success_rate_5m)}
        </span>
      </div>
      <p className="num mt-1 font-mono text-[10px] text-fg-faint">
        {cell.failure_velocity_5m.toFixed(2)} failures/min
      </p>
    </div>
  );
}

/**
 * Split `issuer|method|provider` into parts.
 *
 * A rail id that does not follow the shape is shown whole rather than silently
 * mangled, because a malformed identifier is worth seeing.
 */
function splitRail(railId: string): { issuer: string; method: string } {
  const [issuer, method] = railId.split("|");
  if (!issuer || !method) return { issuer: railId, method: "—" };
  return { issuer, method: method.toUpperCase() };
}
