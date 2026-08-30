"use client";

import { AlertTriangle, FlaskConical } from "lucide-react";
import React from "react";
import { StateNotice } from "@/components/StateNotice";
import { formatPercent } from "@/lib/formatters";
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

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * The measured off-policy evaluation, as produced by `make eval`.
 *
 * This page previously offered a free-text "policy hypothesis tester" backed by
 * three hardcoded scenarios. Typing a question ran a 600ms `setTimeout` and
 * then displayed one of them: a 59.2% recovery rate, a ₹2.28L Doubly Robust
 * estimate with a confidence interval, and an effective sample size of 1940 --
 * under a badge reading "Doubly Robust Statistical Engine". No estimator ran.
 *
 * The honest version of that feature needs the eval harness reachable from the
 * console, which means exposing `packages/salvage-eval` behind an endpoint that
 * can run a policy specification. Until that exists, this shows the real
 * results the harness produced on its last run, including the ones that are
 * unflattering.
 */
export function SandboxSimulator(): React.ReactElement {
  const { phase, data, error } = useApi<EvaluationResults>("/api/evaluation");

  return (
    <div className="w-full space-y-6 flex flex-col items-center text-center">
      <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 flex flex-col items-center text-center">
        <div className="flex flex-col items-center justify-center mb-3 space-y-1">
          <h2 className="text-base sm:text-lg font-serif font-bold text-slate-900 flex items-center justify-center gap-2">
            <FlaskConical className="w-4 h-4 text-emerald-600" />
            Off-Policy Evaluation
          </h2>
          <p className="text-xs text-slate-500 max-w-2xl">
            Four estimators compared against known ground truth on held-out synthetic episodes.
          </p>
        </div>

        {phase !== "ready" || !data ? (
          <StateNotice
            // `ready` with no payload should not happen, but the type permits
            // it; treating it as "missing" is the honest reading of an empty
            // successful response.
            phase={phase === "ready" ? "missing" : phase}
            error={error}
            emptyTitle="No evaluation results yet"
            emptyBody="Run `make eval` to run the harness. It writes EVALUATION.md and docs/evaluation-results.json, and this page reads the latter."
          />
        ) : (
          <>
            <div className="w-full max-w-3xl rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-left mb-5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-900 leading-relaxed">{data.framing}</p>
              </div>
            </div>

            <p className="text-[10px] font-mono text-slate-400 mb-4">
              {data.episodes.toLocaleString("en-IN")} episodes · seed {data.seed} ·{" "}
              {data.bootstraps} bootstraps · generated{" "}
              {new Date(data.generated_at).toLocaleString()}
            </p>

            <div className="w-full overflow-x-auto">
              <table className="w-full text-center border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 px-3 font-semibold">Policy</th>
                    <th className="pb-3 px-3 font-semibold">True recovery</th>
                    <th className="pb-3 px-3 font-semibold">Ground truth</th>
                    <th className="pb-3 px-3 font-semibold">Doubly robust [95% CI]</th>
                    <th className="pb-3 px-3 font-semibold">Kish ESS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.policies.map((policy) => (
                    <tr key={policy.policy_name} className="hover:bg-slate-50/60">
                      <td className="py-3 px-3 font-bold text-slate-800 text-left">
                        {policy.policy_name}
                        {!policy.doubly_robust.is_identifiable && (
                          <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-bold">
                            NOT IDENTIFIABLE
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 tabular-nums text-slate-700">
                        {formatPercent(policy.ground_truth_recovery_rate)}
                      </td>
                      <td className="py-3 px-3 tabular-nums text-slate-700">
                        {rupees(policy.ground_truth_value)}
                      </td>
                      <td className="py-3 px-3 tabular-nums text-slate-600">
                        {rupees(policy.doubly_robust.estimated_value)}{" "}
                        <span className="text-slate-400">
                          [{rupees(policy.doubly_robust.ci_lower)},{" "}
                          {rupees(policy.doubly_robust.ci_upper)}]
                        </span>
                      </td>
                      <td className="py-3 px-3 tabular-nums text-slate-600">
                        {policy.doubly_robust.effective_sample_size.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-slate-500 max-w-2xl mt-5 font-sans">
              The comparison that matters is between each estimator and the ground-truth column:
              it measures whether the evaluation methodology recovers a known answer. It is not a
              claim about production performance, because the episodes are simulated.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
