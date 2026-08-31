"use client";

import { AlertTriangle } from "lucide-react";
import React from "react";
import { StateNotice } from "@/components/StateNotice";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { DataTable, Td, Th } from "@/components/ui/Primitives";
import { formatCount, formatPercent, formatRupeesWhole } from "@/lib/formatters";
import { useApi } from "@/lib/useApi";

interface EstimatorResult {
  estimator_name: string;
  estimated_value: number;
  ci_lower: number;
  ci_upper: number;
  standard_error: number;
  effective_sample_size: number;
  is_identifiable: boolean;
  diagnostics_warning: string | null;
}

interface PolicySummary {
  policy_name: string;
  ground_truth_value: number;
  ground_truth_recovery_rate: number;
  ips: EstimatorResult;
  snips: EstimatorResult;
  direct_method: EstimatorResult;
  doubly_robust: EstimatorResult;
}

interface EvaluationResults {
  generated_at: string;
  episodes: number;
  bootstraps: number;
  seed: number;
  framing: string;
  policies: PolicySummary[];
}

/**
 * The measured off-policy evaluation, as produced by `make eval`.
 *
 * This page previously offered a free-text "policy hypothesis tester" backed by
 * three hardcoded scenarios. Typing a question ran a 600ms `setTimeout` and
 * displayed one of them: a 59.2% recovery rate, a ₹2.28L Doubly Robust estimate
 * with a confidence interval, and an effective sample size of 1940 — under a
 * badge reading "Doubly Robust Statistical Engine". No estimator ran.
 *
 * What is here reads `docs/evaluation-results.json`, the file the harness
 * writes alongside EVALUATION.md, so the console cannot disagree with the
 * committed report or show a result no run produced. Including the unflattering
 * ones: the column that matters is each estimator against ground truth, which
 * measures whether the *methodology* recovers a known answer.
 */
export function SandboxSimulator(): React.ReactElement {
  const { phase, data, error } = useApi<EvaluationResults>("/api/evaluation");

  return (
    <Panel>
      <PanelHeader
        eyebrow="Held-out synthetic episodes"
        title="Off-policy evaluation"
        note="Four estimators compared against known ground truth. The comparison that matters is estimator versus ground truth — it measures whether the methodology recovers an answer we already know."
        right={
          data ? (
            <div className="text-right font-mono text-[10px] leading-relaxed text-fg-faint">
              <p className="num">{formatCount(data.episodes)} episodes</p>
              <p className="num">
                seed {data.seed} · {formatCount(data.bootstraps)} bootstraps
              </p>
              <p>{new Date(data.generated_at).toLocaleDateString()}</p>
            </div>
          ) : null
        }
      />

      {phase !== "ready" || !data ? (
        <StateNotice
          phase={phase === "ready" ? "missing" : phase}
          error={error}
          emptyTitle="No evaluation results yet"
          emptyBody="Run `make eval`. The harness writes EVALUATION.md and docs/evaluation-results.json, and this page reads the latter."
        />
      ) : (
        <PanelBody className="!px-0 !py-0">
          <div className="state-degraded mx-5 mt-4 flex items-start gap-2 rounded-lg border border-degraded/30 bg-degraded/[0.06] px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-degraded" />
            <p className="max-w-3xl text-[11px] leading-relaxed text-degraded">{data.framing}</p>
          </div>

          <div className="px-2 py-3">
            <DataTable
              head={
                <>
                  <Th>Policy</Th>
                  <Th align="right">True recovery</Th>
                  <Th align="right">Ground truth</Th>
                  <Th align="right">Doubly robust [95% CI]</Th>
                  <Th align="right">Kish ESS</Th>
                </>
              }
            >
              {data.policies.map((policy) => (
                <tr key={policy.policy_name} className="transition-colors hover:bg-ink-2/70">
                  <Td className="text-fg">
                    {policy.policy_name}
                    {!policy.doubly_robust.is_identifiable ? (
                      <span className="state-down state-chip ml-2 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase">
                        not identifiable
                      </span>
                    ) : null}
                  </Td>
                  <Td align="right" className="num font-mono text-fg-muted">
                    {formatPercent(policy.ground_truth_recovery_rate)}
                  </Td>
                  <Td align="right" className="num font-mono text-fg">
                    {formatRupeesWhole(policy.ground_truth_value)}
                  </Td>
                  <Td align="right" className="num font-mono text-fg-muted">
                    {formatRupeesWhole(policy.doubly_robust.estimated_value)}
                    <span className="ml-1.5 text-fg-faint">
                      [{formatRupeesWhole(policy.doubly_robust.ci_lower)},{" "}
                      {formatRupeesWhole(policy.doubly_robust.ci_upper)}]
                    </span>
                  </Td>
                  <Td align="right" className="num font-mono text-fg-muted">
                    {formatCount(policy.doubly_robust.effective_sample_size)}
                  </Td>
                </tr>
              ))}
            </DataTable>
          </div>

          <p className="max-w-3xl border-t border-line px-5 py-4 text-[11px] leading-relaxed text-fg-faint">
            These are simulated episodes from <span className="font-mono">packages/salvage-sim</span>,
            not production performance. Nothing in this system has run against real payment traffic,
            and no figure on this page should be read as though it had.
          </p>
        </PanelBody>
      )}
    </Panel>
  );
}
