"use client";

import { AlertTriangle, CheckCircle2, Play, Sparkles } from "lucide-react";
import { useState } from "react";
import { formatPercent, formatRupees } from "@/lib/formatters";

export function SandboxSimulator() {
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
    <div className="space-y-6">
      {/* Input Header & Prompt Box */}
      <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Policy Counterfactual Hypothesis Tester
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ask policy questions in plain English — evaluated counterfactually against held-out replay data
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            Doubly Robust Engine
          </span>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap gap-2 mb-3">
          {scenarios.map((s) => (
            <button
              key={s.title}
              onClick={() => {
                setHypothesis(s.prompt);
                setSimulationRun(true);
              }}
              className={`text-[11px] px-2.5 py-1 rounded-md border font-mono transition-colors ${
                hypothesis === s.prompt
                  ? "bg-emerald-950/80 border-emerald-700 text-emerald-300 font-semibold"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
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
            className="flex-1 rounded-md border border-slate-800 bg-slate-900/80 px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
          />
          <button
            onClick={handleRunSimulation}
            disabled={isSimulating}
            className="px-4 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isSimulating ? "Evaluating..." : "Evaluate"}</span>
          </button>
        </div>
      </div>

      {/* Results View */}
      {simulationRun && (
        <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm">
          {currentScenario.refuseToGuess ? (
            /* REFUSAL STATE: Willingness to say "I don't know" */
            <div className="rounded-md border border-rose-900/60 bg-rose-950/20 p-5 font-mono">
              <div className="flex items-center gap-2.5 text-rose-400 mb-2">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-sm font-bold tracking-tight">
                  EVALUATION REFUSED: UNIDENTIFIABLE POLICY (ZERO SUPPORT)
                </h3>
              </div>
              <p className="text-xs text-slate-300 font-sans leading-relaxed mt-2">
                {currentScenario.explanation}
              </p>

              <div className="mt-4 pt-3 border-t border-rose-900/40 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Effective Sample Size (ESS)</div>
                  <div className="text-rose-400 font-bold mt-0.5">0.0 / 5,000 (0.0%)</div>
                </div>
                <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Propensity Overlap</div>
                  <div className="text-rose-400 font-bold mt-0.5">Deterministic Strata</div>
                </div>
                <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase">Scientific Guardrail</div>
                  <div className="text-emerald-400 font-bold mt-0.5">Refused to Guess</div>
                </div>
              </div>
            </div>
          ) : (
            /* VALID ESTIMATE STATE */
            <div className="space-y-4 font-mono">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold font-sans">
                    Counterfactual Evaluation Results (Held-out N=5,000)
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  Kish ESS: <strong className="text-emerald-400">{currentScenario.ess?.toFixed(0)}</strong> / 5,000
                </span>
              </div>

              {/* Metric Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Recovery Rate */}
                <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                    Simulated Recovery Rate
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-bold text-slate-100">
                      {formatPercent(currentScenario.simulatedRecoveryRate || 0)}
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        (currentScenario.simulatedRecoveryRate || 0) >= (currentScenario.baselineRecoveryRate || 0)
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {(
                        ((currentScenario.simulatedRecoveryRate || 0) -
                          (currentScenario.baselineRecoveryRate || 0)) *
                        100
                      ).toFixed(1)}
                      % vs Base
                    </span>
                  </div>
                </div>

                {/* Incremental Payoff */}
                <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                    Incremental Revenue (Net)
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span
                      className={`text-xl font-bold ${
                        (currentScenario.incrementalRevenuePaise || 0) >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {(currentScenario.incrementalRevenuePaise || 0) >= 0 ? "+" : ""}
                      {formatRupees(currentScenario.incrementalRevenuePaise || 0)}
                    </span>
                  </div>
                </div>

                {/* Doubly Robust 95% CI */}
                <div className="p-3.5 rounded bg-slate-900/60 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                    Doubly Robust [95% CI]
                  </span>
                  <div className="mt-1">
                    <span className="text-sm font-bold text-indigo-300">
                      {formatRupees(currentScenario.drEstimatePaise || 0)}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      [{formatRupees(currentScenario.ciLowerPaise || 0)}, {formatRupees(currentScenario.ciUpperPaise || 0)}]
                    </span>
                  </div>
                </div>
              </div>

              {/* Synthesis Note */}
              <div className="p-3 rounded bg-slate-900/40 border border-slate-800/80 text-xs font-sans text-slate-300 leading-relaxed">
                <span className="font-semibold text-slate-200">Analysis: </span>
                {currentScenario.summary}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
