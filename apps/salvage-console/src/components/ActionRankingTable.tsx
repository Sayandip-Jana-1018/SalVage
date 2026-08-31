"use client";

import { Check } from "lucide-react";
import React from "react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { DataTable, Td, Th } from "@/components/ui/Primitives";
import { formatPaise, formatPercent } from "@/lib/formatters";
import type { ActionValuation, RecoveryAction } from "@/types";

/**
 * The candidate actions the policy engine valued, and the one it chose.
 *
 * Rendered straight from `candidate_valuations` on the decision response. The
 * version this replaces took a locally-defined shape carrying
 * `friction_penalty_paise`, `is_permitted_by_bounds` and `rejection_reason` —
 * fields the policy engine does not return — and displayed a hardcoded
 * "Optimal Decision: SWITCH_RAIL" badge regardless of what was chosen.
 *
 * Bounds status is deliberately absent. The bounds engine runs in salvage-core
 * *after* the policy engine has ranked actions, and its verdict is recorded on
 * the decision row rather than per valuation. A permitted/refused column here
 * would be inventing a verdict per row.
 */
export function ActionRankingTable({
  actions,
  chosenAction,
}: {
  actions: ActionValuation[];
  chosenAction: RecoveryAction;
}): React.ReactElement {
  const ranked = [...actions].sort(
    (a, b) => b.net_expected_value_paise - a.net_expected_value_paise,
  );

  return (
    <Panel>
      <PanelHeader
        align="left"
        eyebrow="Expected net value"
        title="Action ranking"
        note="net = P(recovery) × amount − cost. The engine ranks every action in its bounded action space and takes the highest. Doing nothing is one of them."
        right={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-iris/35 bg-iris/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-iris">
            <Check className="h-3 w-3" />
            {chosenAction}
          </span>
        }
      />

      {ranked.length === 0 ? (
        <PanelBody>
          <p className="text-xs text-fg-muted">The decision recorded no candidate valuations.</p>
        </PanelBody>
      ) : (
        <PanelBody className="!px-2 !py-1">
          <DataTable
            head={
              <>
                <Th>Action</Th>
                <Th align="right">P(recovery)</Th>
                <Th align="right">Gross</Th>
                <Th align="right">Cost</Th>
                <Th align="right">Net</Th>
              </>
            }
          >
            {ranked.map((valuation) => {
              const chosen = valuation.action === chosenAction;
              return (
                <tr
                  key={valuation.action}
                  className={chosen ? "bg-iris/[0.07]" : "transition-colors hover:bg-white/[0.035]"}
                >
                  <Td className="font-mono text-fg">
                    <span className="inline-flex items-center gap-1.5">
                      {chosen ? <Check className="h-3 w-3 text-iris" /> : <span className="w-3" />}
                      {valuation.action}
                    </span>
                  </Td>
                  <Td align="right" className="num font-mono text-fg-muted">
                    {formatPercent(valuation.recovery_probability)}
                  </Td>
                  <Td align="right" className="num font-mono text-fg-muted">
                    {formatPaise(valuation.gross_expected_value_paise)}
                  </Td>
                  <Td align="right" className="num font-mono text-fg-muted">
                    {formatPaise(valuation.estimated_cost_paise)}
                  </Td>
                  <Td
                    align="right"
                    className={`num font-mono font-semibold ${
                      valuation.net_expected_value_paise >= 0 ? "text-healthy" : "text-down"
                    }`}
                  >
                    {formatPaise(valuation.net_expected_value_paise)}
                  </Td>
                </tr>
              );
            })}
          </DataTable>
        </PanelBody>
      )}
    </Panel>
  );
}
