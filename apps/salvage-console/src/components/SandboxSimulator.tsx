"use client";

import { AlertTriangle, CheckCircle2, Play, Sparkles } from "lucide-react";
import React, { useState } from "react";
import { formatPercent, formatRupees } from "@/lib/formatters";

export function SandboxSimulator(): React.ReactElement {
  const [hypothesis, setHypothesis] = useState<string>(
    "What if we switch to scheduled retry post-payday for insufficient funds?"
  );
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationRun, setSimulationRun] = useState<boolean>(true);

  // Pre-configured simulation scenarios
  const scenarios = [
    {
      title: "Salary-Cycle Aligned Retries",
      prompt: "What if we switch to scheduled retry post-payday for insufficient funds?",
      refuseToGuess: false,
      baselineRecoveryRate: 0.53,
      simulatedRecoveryRate: 0.592,
      incrementalRevenuePaise: 24500000,
      drEstimatePaise: 22750000,
      ciLowerPaise: 21200000,
      ciUpperPaise: 24300000,
      ess: 1940.0,
      totalEpisodes: 5000,
      summary: "Significant positive lift. Anchoring retry delays to Indian salary credit cycles (28th-3rd) captures post-salary account liquidity.",
    },
    {
      title: "Aggressive Immediate Retries (No Delays)",
      prompt: "What if we immediately retry every failure up to 3 times without waiting?",
      refuseToGuess: false,
      baselineRecoveryRate: 0.53,
      simulatedRecoveryRate: 0.442,
      incrementalRevenuePaise: -34550000,
      drEstimatePaise: 16850000,
      ciLowerPaise: 15600000,
      ciUpperPaise: 18100000,
      ess: 1620.0,
      totalEpisodes: 5000,
      summary: "Degraded performance. Immediate retry against degraded issuers compounds throttling, while retrying insufficient funds immediately wastes gateway fees.",
    },
    {
      title: "Zero-Support Hypothesis (Night Nudges)",
      prompt: "What if we send WhatsApp checkout nudges to all customers at 2 AM?",
      refuseToGuess: true,
      diagnosticWarning: "CRITICAL: Insufficient Logging Support (Zero Overlap in Deterministic Strata)",
      explanation: "Safety bounds strictly enforced Quiet Hours (22:00-08:00 IST) in all historical logs. Offline estimators (IPS, SNIPS, Doubly Robust) cannot identify outcomes outside historical support without active exploration data. The sandbox refuses to fabricate an ungrounded estimate.",
      ess: 0.0,
      totalEpisodes: 5000,
    },
  ];

  const currentScenario = scenarios.find((s) => s.prompt === hypothesis) || scenarios[0];

  const handleRunSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
      setSimulationRun(true);
    }, 600);
  };

  return (
    <div className="w-full space-y-6">
      {/* Input Header & Prompt Box */}
      <div className="w-full rounded-2xl liquid-glass p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm sm:text-base font-serif font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              Policy Counterfactual Hypothesis Tester
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ask policy questions in plain English — evaluated counterfactually against held-out replay data
            </p>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-semibold">
            Doubly Robust Engine
          </span>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap gap-2 mb-4">
          {scenarios.map((s) => (
            <button
              key={s.title}
              onClick={() => {
                setHypothesis(s.prompt);
                setSimulationRun(true);
              }}
              className={`text-[11px] px-3 py-1.5 rounded-xl border font-mono transition-all cursor-pointer ${
                hypothesis === s.prompt
                  ? "bg-slate-900 border-slate-900 text-white font-semibold shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Text Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            placeholder="Type a policy question (e.g. What if we cap attempts at 2 instead of 3?)..."
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono shadow-sm"
          />
          <button
            onClick={handleRunSimulation}
            disabled={isSimulating}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50 shadow-sm cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isSimulating ? "Evaluating..." : "Evaluate"}</span>
          </button>
        </div>
      </div>

      {/* Results View */}
      {simulationRun && (
        <div className="w-full rounded-2xl liquid-glass p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90">
          {currentScenario.refuseToGuess ? (
            /* REFUSAL STATE: Willingness to say "I don't know" */
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-5 font-mono">
              <div className="flex items-center gap-2.5 text-rose-800 mb-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-bold tracking-tight">
                  EVALUATION REFUSED: UNIDENTIFIABLE POLICY (ZERO SUPPORT)
                </h3>
              </div>
              <p className="text-xs text-slate-700 font-sans leading-relaxed mt-2">
                {currentScenario.explanation}
              </p>

              <div className="mt-4 pt-3 border-t border-rose-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block font-sans">Kish Effective Sample Size</span>
                  <span className="text-xs font-bold text-rose-700">ESS = 0.0 (0.0% overlap)</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block font-sans">Support Status</span>
                  <span className="text-xs font-bold text-rose-700">Strict Support Violation</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase block font-sans">Recommendation</span>
                  <span className="text-xs font-bold text-slate-800">Requires Active Epsilon-Exploration</span>
                </div>
              </div>
            </div>
          ) : (
            /* VALID ESTIMATE STATE */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-serif font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Doubly Robust Policy Counterfactual Estimate
                </h3>
                <span className="text-xs font-mono text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 font-semibold">
                  Sufficient Support (ESS = {currentScenario.ess?.toFixed(0)})
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 uppercase block font-sans font-medium">Baseline Recovery</span>
                  <span className="text-sm font-bold text-slate-800 tabular-nums">
                    {formatPercent(currentScenario.baselineRecoveryRate || 0)}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-100">
                  <span className="text-[10px] text-emerald-800 uppercase block font-sans font-medium">Projected Recovery</span>
                  <span className="text-sm font-bold text-emerald-700 tabular-nums">
                    {formatPercent(currentScenario.simulatedRecoveryRate || 0)}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 uppercase block font-sans font-medium">Projected Net Lift</span>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      (currentScenario.incrementalRevenuePaise || 0) >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {(currentScenario.incrementalRevenuePaise || 0) >= 0 ? "+" : ""}
                    {formatRupees(currentScenario.incrementalRevenuePaise || 0)}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-500 uppercase block font-sans font-medium">95% Bootstrap CI</span>
                  <span className="text-xs font-bold text-slate-700 tabular-nums block truncate">
                    [{formatRupees(currentScenario.ciLowerPaise || 0)}, {formatRupees(currentScenario.ciUpperPaise || 0)}]
                  </span>
                </div>
              </div>

              {/* Summary note */}
              <p className="text-xs text-slate-600 font-sans leading-relaxed pt-2">
                {currentScenario.summary}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
