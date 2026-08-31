"use client";

import { AlertTriangle } from "lucide-react";
import React from "react";
import { CalibrationCurve } from "@/components/eval/CalibrationCurve";
import { ForestPlot } from "@/components/eval/ForestPlot";
import { PairedComparison } from "@/components/eval/PairedComparison";
import { StateNotice } from "@/components/StateNotice";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { DataTable, Td, Th } from "@/components/ui/Primitives";
import { formatCount, formatMeanPaise, formatPercent } from "@/lib/formatters";
import { useApi } from "@/lib/useApi";
import type { EvaluationResults, PolicySummary } from "@/types";

/**
 * The measured off-policy evaluation, as produced by `make eval`.
 *
 * This page previously offered a free-text "policy hypothesis tester" backed by
 * three hardcoded scenarios. Typing a question ran a 600ms `setTimeout` and
 * displayed one of them: a 59.2% recovery rate, a ₹2.28L Doubly Robust estimate
 * with a confidence interval, and an effective sample size of 1940 — under a
 * badge reading "Doubly Robust Statistical Engine". No estimator ran.
 *
 * What is here reads `docs/evaluation-results.json`, the file the harness writes
 * alongside EVALUATION.md, so the console cannot disagree with the committed
 * report or show a result no run produced.
 *
 * The charts were added because the table was hiding the finding. A reader
 * comparing an estimate against a ground-truth column is doing arithmetic seven
 * times to answer one question — does the interval cover the truth — that a
 * forest plot answers by looking. Nothing here is computed by the console
 * beyond a coordinate: every value is a field in the file.
 */
export function SandboxSimulator(): React.ReactElement {
  const { phase, data, error } = useApi<EvaluationResults>("/api/evaluation");

  if (phase !== "ready" || !data) {
    return (
      <Panel index={0}>
        <PanelHeader eyebrow="Held-out synthetic episodes" title="Off-policy evaluation" />
        <StateNotice
          phase={phase === "ready" ? "missing" : phase}
          error={error}
          emptyTitle="No evaluation results yet"
          emptyBody="Run `make eval`. The harness writes EVALUATION.md and docs/evaluation-results.json, and this page reads the latter."
        />
      </Panel>
    );
  }

  // Calibration is reported per policy; the shipped one is the one worth
  // plotting, and the harness names it in the paired comparison rather than
  // this file guessing by string match.
  const shippedName = data.policy_vs_best_baseline?.challenger;
  const shipped =
    data.policies.find((policy) => policy.policy_name === shippedName) ?? data.policies[0];

  return (
    <div className="space-y-4">
      <Panel index={1}>
        <PanelHeader
          eyebrow="Held-out synthetic episodes"
          title="Off-policy evaluation"
          note="Four estimators against known ground truth. The comparison that matters is estimator versus truth — it measures whether the methodology recovers an answer we already have."
          right={
            <div className="text-right font-mono text-[10px] leading-relaxed text-fg-faint">
              <p className="num">{formatCount(data.episodes)} episodes</p>
              <p className="num">
                seed {data.seed} · {formatCount(data.bootstraps)} bootstraps
              </p>
              {data.simulated_days ? (
                <p className="num">
                  {formatCount(data.simulated_days)} days ×{" "}
                  {formatCount(data.simulated_merchants ?? 0)} merchants
                </p>
              ) : null}
            </div>
          }
        />

        <PanelBody className="!px-0 !py-0">
          <div className="state-degraded mx-5 mt-4 flex items-start gap-2 rounded-lg border border-degraded/30 bg-degraded/[0.06] px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-degraded" />
            <p className="max-w-3xl text-[11px] leading-relaxed text-degraded">{data.framing}</p>
          </div>

          <div className="px-5 py-5">
            <ForestPlot policies={data.policies} />
          </div>
        </PanelBody>
      </Panel>

      {data.policy_vs_best_baseline || data.shadow_comparison ? (
        <Panel index={2}>
          <PanelHeader
            eyebrow="Paired bootstrap"
            title="Head to head"
            note="One resample, both policies scored on it, the per-episode difference bootstrapped. Comparing two independently-built intervals for overlap throws away the variance the policies share and is badly under-powered."
          />
          <PanelBody className="grid gap-3 lg:grid-cols-2">
            {data.policy_vs_best_baseline ? (
              <PairedComparison
                comparison={data.policy_vs_best_baseline}
                title="Policy vs strongest simple baseline"
                note="the margin survives resampling, so it is not an artefact of which episodes were drawn"
              />
            ) : null}
            {data.shadow_comparison ? (
              <PairedComparison
                comparison={data.shadow_comparison}
                title="Shadow: challenger vs shipped policy"
                note="the harness declining to claim an improvement it cannot support, which is what it is for"
              />
            ) : null}
          </PanelBody>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
        <Panel index={3}>
          <PanelHeader
            eyebrow="Every policy, every column"
            title="Results table"
            note="Kish effective sample size is how many episodes the importance weights are really worth. A large gap between it and the episode count means the estimate rests on far fewer observations than it appears to."
          />
          <PanelBody className="!px-2 !py-1">
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
                <ResultRow key={policy.policy_name} policy={policy} />
              ))}
            </DataTable>
          </PanelBody>
        </Panel>

        {shipped?.calibration ? (
          <Panel className="xl:w-[26rem]">
            <PanelHeader
              eyebrow="Is a probability a promise?"
              title="Calibration"
              note={
                <>
                  For <span className="font-mono text-fg-muted">{shipped.policy_name}</span>. Of the
                  attempts scored at 0.7, roughly seven in ten should recover.
                </>
              }
            />
            <PanelBody>
              <CalibrationCurve
                deciles={shipped.calibration.deciles}
                brierScore={shipped.calibration.brier_score}
              />
            </PanelBody>
          </Panel>
        ) : null}
      </div>

      <p className="max-w-3xl px-1 text-[11px] leading-relaxed text-fg-faint">
        These are simulated episodes from{" "}
        <span className="font-mono">packages/salvage-sim</span>, not production performance.
        Nothing in this system has run against real payment traffic, and no figure on this page
        should be read as though it had.
      </p>
    </div>
  );
}

function ResultRow({ policy }: { policy: PolicySummary }): React.ReactElement {
  const dr = policy.doubly_robust;
  return (
    <tr className="transition-colors hover:bg-white/[0.035]">
      <Td className="text-fg">
        {policy.policy_name}
        {!dr.is_identifiable ? (
          <span className="state-down state-chip ml-2 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase">
            not identifiable
          </span>
        ) : null}
      </Td>
      <Td align="right" className="num font-mono text-fg-muted">
        {formatPercent(policy.ground_truth_recovery_rate)}
      </Td>
      <Td align="right" className="num font-mono text-fg">
        {formatMeanPaise(policy.ground_truth_value)}
      </Td>
      <Td align="right" className="num font-mono text-fg-muted">
        {formatMeanPaise(dr.estimated_value)}
        <span className="ml-1.5 text-fg-faint">
          [{formatMeanPaise(dr.ci_lower)}, {formatMeanPaise(dr.ci_upper)}]
        </span>
      </Td>
      <Td align="right" className="num font-mono text-fg-muted">
        {formatCount(dr.effective_sample_size)}
      </Td>
    </tr>
  );
}
