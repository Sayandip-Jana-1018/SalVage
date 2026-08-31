"use client";

import { ShieldCheck } from "lucide-react";
import React from "react";
import { StateNotice } from "@/components/StateNotice";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { StateChip, StateDot } from "@/components/ui/Primitives";
import { formatAge, formatPercent } from "@/lib/formatters";
import { useApi } from "@/lib/useApi";
import type { RailHealthMatrix, RailHealthView } from "@/types";

const POLL_MS = 5000;

/**
 * Rails currently degraded or down, derived from live sensing.
 *
 * The version this replaces rendered a single hardcoded incident: a named bank,
 * a fixed "34 affected merchants", ₹3.4L at risk, "1,284 txns auto-rerouted",
 * and a detection time of "14:02:11 IST (2m 14s ago)" that never changed. None
 * of it moved and none of it was measured.
 *
 * What is here reports only what the sensing service knows: which rails are
 * unhealthy and how unhealthy. There is no blast radius, because counting
 * affected merchants means a cross-tenant aggregate no endpoint serves — that
 * is ADR-0007 work, and until it exists the number would be invented.
 */
export function IncidentCard(): React.ReactElement {
  const { phase, data, error } = useApi<RailHealthMatrix>("/api/rails", POLL_MS);

  const incidents = (data?.rails ?? []).filter(
    (rail) => rail.state === "DEGRADED" || rail.state === "DOWN",
  );
  const worst = incidents.some((rail) => rail.state === "DOWN") ? "DOWN" : "DEGRADED";
  const observed = data?.rails.length ?? 0;

  if (phase !== "ready" && !data) {
    return (
      <Panel>
        <PanelHeader eyebrow="Sensing" title="Open incidents" />
        <StateNotice phase={phase} error={error} emptyTitle="No sensing data" />
      </Panel>
    );
  }

  if (incidents.length === 0) {
    return (
      <Panel>
        <PanelHeader
          eyebrow="Sensing"
          title="No rails unhealthy"
          note={
            observed === 0
              ? "No rails have been observed yet, so this is an absence of data rather than an all-clear."
              : `All ${observed} observed rail${observed === 1 ? "" : "s"} are sensed healthy.`
          }
          right={<StateChip state={observed === 0 ? "UNOBSERVED" : "HEALTHY"} label={observed === 0 ? "no data" : "clear"} />}
        />
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        eyebrow="Sensing"
        title={`${incidents.length} rail${incidents.length === 1 ? "" : "s"} unhealthy`}
        note={
          <>
            Sensing reports rail state. Whether any individual payment is retried, rerouted or
            left alone is decided per attempt by the policy engine and gated by the bounds engine.
          </>
        }
        right={
          <div className="flex items-center gap-2">
            <StateChip state={worst} />
            <span className="hidden font-mono text-[10px] text-fg-faint sm:inline">
              {data ? formatAge(data.timestamp) : "—"}
            </span>
          </div>
        }
      />
      <PanelBody>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {incidents.map((rail) => (
            <IncidentTile key={rail.rail_id} rail={rail} />
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-fg-faint">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          An unhealthy rail does not by itself authorise anything. The bounds engine in
          salvage-core holds the attempt cap, quiet hours, contact budgets and the kill switch,
          and it refuses independently of whatever proposed the action.
        </p>
      </PanelBody>
    </Panel>
  );
}

function IncidentTile({ rail }: { rail: RailHealthView }): React.ReactElement {
  const [issuer, method] = splitRail(rail.rail_id);
  return (
    <li className={`${rail.state === "DOWN" ? "state-down" : "state-degraded"} state-tile rounded-xl p-3`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <StateDot state={rail.state} />
          <span className="truncate font-mono text-[11px] text-fg" title={rail.rail_id}>
            {issuer}
          </span>
        </span>
        <span className="state-text font-mono text-[10px] font-semibold uppercase tracking-wider">
          {rail.state}
        </span>
      </div>
      <dl className="mt-2.5 grid grid-cols-2 gap-2">
        <div>
          <dt className="eyebrow">{method}</dt>
          <dd className="num mt-1 font-mono text-sm text-fg">{formatPercent(rail.success_rate_5m)}</dd>
          <dd className="text-[10px] text-fg-faint">5m success</dd>
        </div>
        <div>
          <dt className="eyebrow">velocity</dt>
          <dd className="num mt-1 font-mono text-sm text-fg">
            {rail.failure_velocity_5m.toFixed(2)}
          </dd>
          <dd className="text-[10px] text-fg-faint">failures/min</dd>
        </div>
      </dl>
    </li>
  );
}

/** `issuer|method|provider`, matching `PaymentFailedEvent.railId()` in salvage-core. */
function splitRail(railId: string): [string, string] {
  const [issuer, method] = railId.split("|");
  if (!issuer || !method) return [railId, "—"];
  return [issuer, method.toUpperCase()];
}
