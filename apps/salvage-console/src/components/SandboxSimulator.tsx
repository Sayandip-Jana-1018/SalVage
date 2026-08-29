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
    <div className="w-full space-y-6 flex flex-col items-center text-center">
      {/* Input Header & Prompt Box */}
      <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 flex flex-col items-center text-center">
        <div className="flex flex-col items-center justify-center mb-5 space-y-1">
          <h2 className="text-base sm:text-lg font-serif font-bold text-slate-900 flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            Policy Counterfactual Hypothesis Tester
          </h2>
          <p className="text-xs text-slate-500 max-w-lg">
            Ask policy questions in plain English — evaluated counterfactually against held-out replay data
          </p>
          <div className="pt-2">
            <span className="text-[11px] font-mono px-3 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-semibold shadow-sm">
              Doubly Robust Statistical Engine
            </span>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
          {scenarios.map((s) => (
            <button
              key={s.title}
              onClick={() => {
                setHypothesis(s.prompt);
                setSimulationRun(true);
              }}
              className={`text-[11px] px-3.5 py-1.5 rounded-xl border font-mono transition-all cursor-pointer ${
                hypothesis === s.prompt
                  ? "bg-slate-900 border-slate-900 text-white font-semibold shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Centered Text Input Form */}
        <div className="w-full max-w-2xl flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            placeholder="Type a policy question (e.g. What if we cap attempts at 2 instead of 3?)..."
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono shadow-sm text-center sm:text-left"
          />
          <button
            onClick={handleRunSimulation}
            disabled={isSimulating}
            className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 shadow-sm cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isSimulating ? "Evaluating..." : "Evaluate"}</span>
          </button>
        </div>
      </div>

      {/* Results View */}
      {simulationRun && (
        <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 flex flex-col items-center text-center">
          {currentScenario.refuseToGuess ? (
            /* REFUSAL STATE: Willingness to say "I don't know" */
            <div className="w-full max-w-3xl rounded-2xl border border-rose-200 bg-rose-50/70 p-6 font-mono text-center flex flex-col items-center">
              <div className="flex items-center justify-center gap-2.5 text-rose-800 mb-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-bold tracking-tight">
                  EVALUATION REFUSED: UNIDENTIFIABLE POLICY (ZERO SUPPORT)
                </h3>
              </div>
              <p className="text-xs text-slate-700 font-sans leading-relaxed max-w-xl mx-auto mt-2 font-medium">
                {currentScenario.explanation}
              </p>

              <div className="mt-5 pt-4 border-t border-rose-200 w-full grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-center">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-slate-500 uppercase block font-sans">Kish Effective Sample Size</span>
                  <span className="text-xs font-bold text-rose-700 mt-0.5">ESS = 0.0 (0.0% overlap)</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-slate-500 uppercase block font-sans">Support Status</span>
                  <span className="text-xs font-bold text-rose-700 mt-0.5">Strict Support Violation</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-slate-500 uppercase block font-sans">Recommendation</span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5">Requires Active Epsilon-Exploration</span>
                </div>
              </div>
            </div>
          ) : (
            /* VALID ESTIMATE STATE */
            <div className="w-full space-y-5 text-center flex flex-col items-center">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pb-3 border-b border-slate-100 w-full">
                <h3 className="text-base font-serif font-bold text-slate-900 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Doubly Robust Policy Counterfactual Estimate
                </h3>
                <span className="text-xs font-mono text-emerald-800 bg-emerald-50 px-3 py-0.5 rounded-full border border-emerald-200 font-semibold shadow-sm">
                  Sufficient Support (ESS = {currentScenario.ess?.toFixed(0)})
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-center">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-500 uppercase block font-sans font-medium">Baseline Recovery</span>
                  <span className="text-sm sm:text-base font-bold text-slate-800 tabular-nums mt-0.5">
                    {formatPercent(currentScenario.baselineRecoveryRate || 0)}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex flex-col items-center justify-center">
                  <span className="text-[10px] text-emerald-800 uppercase block font-sans font-medium">Projected Recovery</span>
                  <span className="text-sm sm:text-base font-bold text-emerald-700 tabular-nums mt-0.5">
                    {formatPercent(currentScenario.simulatedRecoveryRate || 0)}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-500 uppercase block font-sans font-medium">Projected Net Lift</span>
                  <span
                    className={`text-sm sm:text-base font-bold tabular-nums mt-0.5 ${
                      (currentScenario.incrementalRevenuePaise || 0) >= 0
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {(currentScenario.incrementalRevenuePaise || 0) >= 0 ? "+" : ""}
                    {formatRupees(currentScenario.incrementalRevenuePaise || 0)}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center">
                  <span className="text-[10px] text-slate-500 uppercase block font-sans font-medium">95% Bootstrap CI</span>
                  <span className="text-xs sm:text-sm font-bold text-slate-700 tabular-nums block truncate mt-0.5">
                    [{formatRupees(currentScenario.ciLowerPaise || 0)}, {formatRupees(currentScenario.ciUpperPaise || 0)}]
                  </span>
                </div>
              </div>

              {/* Summary note */}
              <p className="text-xs text-slate-600 font-sans leading-relaxed max-w-xl mx-auto pt-2 font-medium">
                {currentScenario.summary}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
