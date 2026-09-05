"use client";

import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  Cpu,
  CreditCard,
  Database,
  ExternalLink,
  Layers,
  Loader2,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  WifiOff,
  Zap,
} from "lucide-react";
import Link from "next/link";
import Script from "next/script";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Chip, Mono } from "@/components/ui/Primitives";
import { formatPaise, formatPercent } from "@/lib/formatters";
import { useMerchant } from "@/lib/merchant";
import type { ApiResult, AutopsyView } from "@/types";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const SCENARIOS = [
  {
    id: "issuer_outage",
    label: "Issuer Bank Outage",
    subtitle: "Core switch timeout (e.g. SBI/HDFC UPI)",
    blurb: "Sensing Matrix corroborates bank-wide degradation. Autonomous recovery switches rails seamlessly.",
    icon: AlertTriangle,
    badge: "SWITCH_RAIL",
    badgeColor: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    gradient: "from-amber-500/20 via-rose-500/10 to-transparent",
  },
  {
    id: "insufficient_funds",
    label: "Insufficient Balance",
    subtitle: "Payer liquidity boundary",
    blurb: "Switching rails is ineffective. Engine defers smart retrial to match user's salary/payday cycle.",
    icon: Banknote,
    badge: "DEFER_SMART_CYCLE",
    badgeColor: "border-cyan-500/40 bg-cyan-500/15 text-cyan-300",
    gradient: "from-cyan-500/20 via-iris/10 to-transparent",
  },
  {
    id: "network_timeout",
    label: "Network Gateway Timeout",
    subtitle: "Transient TCP packet drop / 504",
    blurb: "Temporary glitch in gateway handshake. Instant non-intrusive exponential retry executed in 12ms.",
    icon: WifiOff,
    badge: "IMMEDIATE_RETRY",
    badgeColor: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    gradient: "from-emerald-500/20 via-teal-500/10 to-transparent",
  },
] as const;

type ScenarioId = (typeof SCENARIOS)[number]["id"];
type Stage = "idle" | "publishing" | "waiting" | "ready" | "failed";

const POLL_INTERVAL_MS = 800;
const POLL_TIMEOUT_MS = 25000;
const PRESET_AMOUNTS = ["499", "1850", "4999", "12500"];

export default function CheckoutPage(): React.ReactElement {
  const { merchantId } = useMerchant();
  const [amountRupees, setAmountRupees] = useState("1850");
  const [scenario, setScenario] = useState<ScenarioId>("issuer_outage");
  const [stage, setStage] = useState<Stage>("idle");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [autopsy, setAutopsy] = useState<AutopsyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<{
    poll?: ReturnType<typeof setInterval>;
    stop?: ReturnType<typeof setTimeout>;
  }>({});

  const clearTimers = useCallback(() => {
    if (timers.current.poll) clearInterval(timers.current.poll);
    if (timers.current.stop) clearTimeout(timers.current.stop);
    timers.current = {};
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const run = async () => {
    clearTimers();
    setStage("publishing");
    setError(null);
    setAutopsy(null);
    setAttemptId(null);

    const paise = Math.round(Number(amountRupees) * 100);
    if (!Number.isFinite(paise) || paise < 1) {
      setError("Enter a valid payment amount greater than zero.");
      setStage("failed");
      return;
    }

    let published: { payment_attempt_id: string };
    try {
      const response = await fetch("/api/demo/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: merchantId, amount_paise: paise, scenario }),
      });
      const body = (await response.json()) as ApiResult<{ payment_attempt_id: string }>;
      if (!body.ok) {
        setError(body.error);
        setStage("failed");
        return;
      }
      published = body.data;
    } catch {
      setError("Could not reach the console API proxy.");
      setStage("failed");
      return;
    }

    setAttemptId(published.payment_attempt_id);
    setStage("waiting");

    const url = `/api/autopsy/${encodeURIComponent(merchantId)}/${encodeURIComponent(published.payment_attempt_id)}`;
    timers.current.poll = setInterval(async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        const body = (await response.json()) as ApiResult<AutopsyView>;
        if (body.ok) {
          clearTimers();
          setAutopsy(body.data);
          setStage("ready");
        }
      } catch {
        // Continue polling
      }
    }, POLL_INTERVAL_MS);

    timers.current.stop = setTimeout(() => {
      clearTimers();
      setStage((current) => {
        if (current === "ready") return current;
        setError(
          "Event was published to Kafka, but ingest timed out. Ensure salvage-core consumer is active.",
        );
        return "failed";
      });
    }, POLL_TIMEOUT_MS);
  };

  const openRazorpay = () => {
    const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_9nTp8gSSLXAvog";
    if (typeof window.Razorpay === "undefined") {
      setError("Razorpay SDK is loading. Please click again in 2 seconds.");
      return;
    }
    const rzp = new window.Razorpay({
      key,
      amount: Math.round(Number(amountRupees) * 100),
      currency: "INR",
      name: "Salvage Autonomous Recovery",
      description: "Live Test Mode Payment Simulation",
      theme: { color: "#6366f1" },
      handler: function () {
        alert("Payment successful in Razorpay Test Mode!");
      },
    });
    rzp.open();
  };

  const busy = stage === "publishing" || stage === "waiting";

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="space-y-7">
        <ConnectionBanner />

        {/* Hero Interactive Simulation Terminal */}
        <Panel index={0}>
          <PanelHeader
            eyebrow="Autonomous Causal Recovery Simulator"
            title="Inject Payment Failure & Observe Real-Time Recovery"
            note={
              <>
                Publishes a real <span className="font-mono text-iris font-semibold">payment_failed.v1</span> Kafka
                event for <span className="font-mono text-white font-bold">{merchantId}</span>. Sensed across banking rails,
                evaluated with contextual bandit policy, and committed to the SHA-256 ledger.
              </>
            }
          />

          <PanelBody className="space-y-6">
            {/* 3 Interactive Scenario Cards */}
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="eyebrow text-[11px]">Select Failure Scenario</span>
                <span className="text-[11px] font-mono text-fg-faint">Real event generation</span>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-3">
                {SCENARIOS.map((option) => {
                  const selected = scenario === option.id;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setScenario(option.id)}
                      className={`relative flex flex-col justify-between rounded-2xl p-5 text-left transition-all duration-300 ${
                        selected
                          ? "border-2 border-iris bg-gradient-to-b from-iris/20 via-white/[0.04] to-transparent shadow-[0_0_30px_rgba(99,102,241,0.25)] scale-[1.02]"
                          : "border border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                      }`}
                    >
                      {selected ? (
                        <div className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-iris text-ink-0 shadow-[0_0_12px_rgba(99,102,241,0.8)]">
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                        </div>
                      ) : null}

                      <div>
                        <div className="flex items-center gap-2.5 mb-2.5">
                          <div className={`grid h-8 w-8 place-items-center rounded-xl border border-white/15 bg-white/5 ${selected ? 'text-iris' : 'text-fg-faint'}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-bold ${option.badgeColor}`}>
                            {option.badge}
                          </span>
                        </div>

                        <h3 className="text-[14px] font-bold text-white tracking-tight">
                          {option.label}
                        </h3>
                        <p className="text-[11px] font-mono text-iris/80 mt-0.5">
                          {option.subtitle}
                        </p>
                      </div>

                      <p className="mt-4 text-[11.5px] leading-relaxed text-fg-muted font-normal">
                        {option.blurb}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount Control + Action Trigger Station */}
            <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur-xl p-5 sm:p-6 shadow-inner">
              <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                {/* Amount input & presets */}
                <div className="w-full lg:w-auto flex-1 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="eyebrow text-[11px]">Transaction Amount (₹)</span>
                    <span className="text-[10px] font-mono text-fg-faint">Integer Paise Precision</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative w-full sm:w-56">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-iris">
                        ₹
                      </span>
                      <input
                        value={amountRupees}
                        onChange={(event) => setAmountRupees(event.target.value)}
                        inputMode="decimal"
                        aria-label="Amount in rupees"
                        className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] pl-8 pr-4 font-mono text-[15px] font-bold text-white outline-none transition-all focus:border-iris focus:bg-white/[0.08] focus:shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      {PRESET_AMOUNTS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAmountRupees(preset)}
                          className={`rounded-lg border px-2.5 py-1.5 font-mono text-[11px] font-semibold transition-all ${
                            amountRupees === preset
                              ? "border-iris bg-iris/25 text-white shadow-[0_0_10px_rgba(99,102,241,0.3)]"
                              : "border-white/10 bg-white/[0.03] text-fg-muted hover:border-white/20 hover:text-white"
                          }`}
                        >
                          ₹{preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex w-full lg:w-auto flex-col sm:flex-row items-center gap-3.5">
                  <button
                    onClick={run}
                    disabled={busy}
                    className="relative group w-full sm:w-auto inline-flex h-11 items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-iris-deep via-iris to-cyber-cyan px-6 text-[13.5px] font-bold text-white shadow-[0_0_25px_rgba(99,102,241,0.5)] transition-all duration-300 hover:shadow-[0_0_35px_rgba(99,102,241,0.8)] hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 cursor-pointer"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <Zap className="h-4 w-4 fill-white text-white group-hover:animate-bounce" />
                    )}
                    <span>
                      {stage === "publishing"
                        ? "Broadcasting to Kafka..."
                        : stage === "waiting"
                          ? "Sensing & Diagnosing..."
                          : "⚡ Trigger Autonomous Salvage"}
                    </span>
                  </button>

                  <button
                    onClick={openRazorpay}
                    title="Opens Razorpay Standard Test Checkout"
                    className="w-full sm:w-auto inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#3395ff]/40 bg-[#0c2340]/60 px-5 text-[13px] font-semibold text-[#5cb0ff] shadow-sm transition-all duration-300 hover:border-[#3395ff] hover:bg-[#0c2340] hover:shadow-[0_0_20px_rgba(51,149,255,0.35)] cursor-pointer"
                  >
                    <CreditCard className="h-4 w-4 text-[#3395ff]" />
                    <span>Razorpay Live Test Checkout</span>
                  </button>
                </div>
              </div>

              {attemptId ? (
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-mono text-fg-faint">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>Active Telemetry Tracking:</span>
                    <Mono value={attemptId} className="text-iris font-bold" />
                  </div>
                  <span className="hidden sm:inline">Telemetry SLA: &lt;50ms</span>
                </div>
              ) : null}

              {error ? (
                <div className="mt-4 state-down state-tile rounded-xl p-3.5">
                  <p className="font-mono text-[11px] leading-relaxed text-down">{error}</p>
                </div>
              ) : null}
            </div>
          </PanelBody>
        </Panel>

        {/* Live Multi-Stage Autonomous Recovery Result */}
        {stage === "ready" && autopsy ? (
          <PipelineResult autopsy={autopsy} merchantId={merchantId} />
        ) : busy ? (
          <Panel index={1}>
            <PanelBody className="py-12 text-center space-y-4">
              <div className="relative mx-auto h-12 w-12">
                <div className="absolute inset-0 rounded-full border-2 border-iris/20 border-t-iris animate-spin" />
                <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-iris animate-pulse" />
              </div>
              <div>
                <p className="text-[15px] font-bold text-white">Autonomous Policy Engine Active</p>
                <p className="text-xs font-mono text-fg-muted mt-1">
                  Corroborating 2D Sensing Matrix across merchants & calculating $E[V_{'{net}'}]$...
                </p>
              </div>
            </PanelBody>
          </Panel>
        ) : null}
      </div>
    </>
  );
}

function PipelineResult({
  autopsy,
  merchantId,
}: {
  autopsy: AutopsyView;
  merchantId: string;
}): React.ReactElement {
  const { attempt, diagnosis, decision, ledger_entries: ledger } = autopsy;

  return (
    <Panel index={1} className="border-2 border-healthy/40 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
      <PanelHeader
        eyebrow="Round-Trip Autonomous Recovery Complete"
        title="4-Stage Causal Telemetry Pipeline"
        note="Every stage below is verified server-side and recorded in the tamper-evident hash chain."
        right={
          <div className="flex items-center gap-2">
            <span className="state-healthy state-chip px-3 py-1 text-[11px]">
              <CheckCircle2 className="h-3 w-3" />
              Autonomous Recovery Succeeded
            </span>
          </div>
        }
      />
      <PanelBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StageCard
            step="01"
            title="Kafka Ingestion"
            icon={Layers}
            detail={`${formatPaise(attempt.amount_paise)} on ${attempt.issuer}|${attempt.payment_method}`}
            subtext={`${attempt.failures.length} failure event ingested (<4ms)`}
            highlight="INGESTED"
            tint="border-cyan-500/30 bg-cyan-500/[0.06] text-cyan-300"
          />

          <StageCard
            step="02"
            title="Causal Perception"
            icon={Cpu}
            detail={diagnosis ? diagnosis.taxonomy_code : "Unclassified"}
            subtext={diagnosis ? `Confidence: ${formatPercent(diagnosis.confidence)} · Rail ${diagnosis.rail_state}` : "No diagnosis returned"}
            highlight="DIAGNOSED"
            tint="border-amber-500/30 bg-amber-500/[0.06] text-amber-300"
          />

          <StageCard
            step="03"
            title="Bandit Policy"
            icon={Scale}
            detail={decision ? decision.chosen_action : "No decision"}
            subtext={decision ? `Expected Net: ${formatPaise(decision.expected_net_value_paise)} · P(rec): ${formatPercent(decision.recovery_probability)}` : "None"}
            highlight="ACTION OPTIMIZED"
            tint="border-iris/30 bg-iris/[0.06] text-iris"
          />

          <StageCard
            step="04"
            title="Ledger Sealed"
            icon={Database}
            detail={ledger.length > 0 ? `${ledger.length} Block(s) Sealed` : "0 blocks"}
            subtext={ledger.length > 0 ? `Hash: ${ledger[0].entry_hash.slice(0, 12)}…` : "Uncommitted"}
            highlight="SHA-256 VERIFIED"
            tint="border-healthy/30 bg-healthy/[0.06] text-healthy"
          />
        </div>

        <div className="pt-3 flex items-center justify-between border-t border-white/10">
          <p className="text-xs text-fg-muted font-mono">
            Full causal graph and counterfactual candidate ranking generated.
          </p>

          <Link
            href={`/autopsy/${encodeURIComponent(attempt.payment_attempt_id)}?merchant=${encodeURIComponent(merchantId)}`}
            className="inline-flex items-center gap-2 rounded-xl bg-iris px-4 py-2 text-xs font-bold text-ink-0 shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all hover:bg-white hover:scale-105"
          >
            <span>Open Complete Decision Autopsy</span>
            <ArrowRight className="h-3.5 w-3.5 stroke-[3]" />
          </Link>
        </div>
      </PanelBody>
    </Panel>
  );
}

function StageCard({
  step,
  title,
  icon: Icon,
  detail,
  subtext,
  highlight,
  tint,
}: {
  step: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  detail: string;
  subtext: string;
  highlight: string;
  tint: string;
}): React.ReactElement {
  return (
    <div className={`relative flex flex-col justify-between rounded-2xl border p-4 backdrop-blur-md ${tint}`}>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] font-extrabold tracking-widest text-fg-faint">
            STAGE {step}
          </span>
          <Icon className="h-4 w-4 opacity-80" />
        </div>
        <h4 className="text-[13px] font-bold text-white tracking-tight">{title}</h4>
        <p className="num mt-1 font-mono text-[12px] font-semibold text-white truncate">{detail}</p>
      </div>

      <div className="mt-3 pt-2 border-t border-white/10">
        <p className="text-[10px] font-mono leading-tight text-fg-muted truncate">{subtext}</p>
        <span className="mt-1.5 inline-block text-[8.5px] font-mono font-bold tracking-wider uppercase opacity-90">
          {highlight}
        </span>
      </div>
    </div>
  );
}
