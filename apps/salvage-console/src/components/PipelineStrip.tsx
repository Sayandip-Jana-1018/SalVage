"use client";

import { ArrowRight } from "lucide-react";
import React from "react";
import { StaleBanner, StateNotice } from "@/components/StateNotice";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Stat } from "@/components/ui/Primitives";
import { formatCount, formatRupeesWhole } from "@/lib/formatters";
import { useMerchant } from "@/lib/merchant";
import { useApi } from "@/lib/useApi";
import type { MerchantStats } from "@/types";

const POLL_MS = 10000;

/**
 * The last 24 hours, as the pipeline that produced them.
 *
 * Four counted stages, in the order the system runs them, so the drop between
 * two adjacent numbers is the thing an operator reads: failures observed,
 * decisions made, decisions permitted, decisions refused by the bounds engine.
 * A large refusal count is not a fault — it is the bounds engine working — and
 * putting it in the same row as the rest is the only way that reads correctly.
 *
 * There is deliberately no "recovered" tile. Confirming a recovery means
 * observing a later success on the same order inside the attribution window,
 * and salvage-core does not yet record that. A tile here would be inventing the
 * one number every dashboard in this category invents.
 */
export function PipelineStrip(): React.ReactElement {
  const { merchantId, ready } = useMerchant();
  const { phase, data, error } = useApi<MerchantStats>(
    ready ? `/api/stats/${encodeURIComponent(merchantId)}?hours=24` : null,
    POLL_MS,
  );

  return (
    <Panel>
      <PanelHeader
        eyebrow="Last 24 hours"
        title="Recovery pipeline"
        note={
          <>
            Counted by salvage-core for{" "}
            <span className="font-mono text-fg-muted">{merchantId}</span>. Every stage is a row in
            the database, not a derived estimate.
          </>
        }
        right={
          data?.truncated ? (
            <span className="state-degraded state-chip rounded-full px-2.5 py-1 font-mono text-[10px] uppercase">
              truncated
            </span>
          ) : null
        }
      />

      {phase !== "ready" && !data ? (
        <StateNotice
          phase={phase}
          error={error}
          emptyTitle="No activity in this window"
          emptyBody="salvage-core has counted nothing for this merchant in the last 24 hours."
        />
      ) : (
        <PanelBody className="space-y-5">
          {phase === "unavailable" && error ? <StaleBanner error={error} /> : null}

          <div className="flex flex-wrap items-start gap-x-2 gap-y-4">
            <Stage
              label="Failures observed"
              value={data ? formatCount(data.failures_observed) : "—"}
              tone="down"
            />
            <Connector />
            <Stage
              label="Decisions made"
              value={data ? formatCount(data.decisions_made) : "—"}
            />
            <Connector />
            <Stage
              label="Permitted"
              value={data ? formatCount(data.decisions_permitted) : "—"}
              tone="healthy"
            />
            <Connector />
            <Stage
              label="Refused by bounds"
              value={data ? formatCount(data.decisions_refused_by_bounds) : "—"}
              tone="degraded"
              hint="Refusal is the bounds engine working, not a fault."
            />
          </div>

          <div className="border-t border-line pt-4">
            <Stat
              label="Expected net value of permitted decisions"
              value={data ? formatRupeesWhole(data.expected_net_value_paise_permitted) : "—"}
              tone="accent"
              hint="Modelled at decision time — P(recovery) × amount − cost, summed. Not money collected: nothing in this system confirms a recovery yet."
            />
          </div>

          {data ? (
            <div className="grid gap-5 border-t border-line pt-4 sm:grid-cols-2">
              <Breakdown title="By cause" counts={data.taxonomy_breakdown} />
              <Breakdown title="By chosen action" counts={data.action_breakdown} />
            </div>
          ) : null}
        </PanelBody>
      )}
    </Panel>
  );
}

function Stage({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "healthy" | "degraded" | "down" | "accent";
  hint?: string;
}): React.ReactElement {
  return (
    <div className="min-w-[8.5rem] flex-1">
      <Stat label={label} value={value} tone={tone} hint={hint} />
    </div>
  );
}

function Connector(): React.ReactElement {
  return (
    <div className="hidden self-center pt-3 sm:block" aria-hidden>
      <ArrowRight className="h-3.5 w-3.5 text-fg-faint/60" />
    </div>
  );
}

/**
 * A proportion bar per key, widest first.
 *
 * The bar is scaled against the largest count rather than the total, so a
 * category holding most of the traffic does not flatten every other row into
 * an invisible sliver. The number beside it is the actual count; the bar is
 * only there to make the ordering readable at a glance.
 */
function Breakdown({
  title,
  counts,
}: {
  title: string;
  counts: Record<string, number>;
}): React.ReactElement {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const largest = rows.length > 0 ? rows[0][1] : 0;

  return (
    <div>
      <p className="eyebrow mb-2.5">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-fg-faint">Nothing counted in this window.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(([key, count]) => (
            <li key={key} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate font-mono text-[11px] text-fg-muted" title={key}>
                {key}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-3">
                <span
                  className="block h-full rounded-full bg-iris/70"
                  style={{ width: largest > 0 ? `${Math.max(2, (count / largest) * 100)}%` : "0%" }}
                />
              </span>
              <span className="num w-12 shrink-0 text-right font-mono text-[11px] text-fg">
                {formatCount(count)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
