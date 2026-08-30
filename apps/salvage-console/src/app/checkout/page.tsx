"use client";

import { ArrowRight, CheckCircle2, Loader2, ShoppingBag, Zap } from "lucide-react";
import Link from "next/link";
import Script from "next/script";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatRupeesDetailed } from "@/lib/formatters";
import { useMerchant } from "@/lib/merchant";
import type { ApiResult, AutopsyView } from "@/types";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

/**
 * Publish a real failure and watch the real system handle it.
 *
 * The page this replaces was a scripted animation. Pressing a button ran a
 * chain of `setTimeout` calls that printed lines like "Sensing Matrix:
 * Corroborated with 34 other merchants (SBI error rate = 88.4%)" and "Ledger
 * Commit: Appended sha256 hash block #48220". Nothing was contacted, no event
 * existed, and the ledger block number was a literal.
 *
 * What happens now: the button publishes a `payment_failed.v1` event to Kafka
 * through salvage-core, the ordinary consumer ingests it, and this page polls
 * the ordinary read path until the attempt appears -- then shows whatever the
 * diagnosis engine, the policy engine and the ledger actually produced. If the
 * pipeline is slow, the page waits. If a stage produces nothing, it says so.
 */

const SCENARIOS = [
  {
    id: "issuer_outage",
    label: "Issuer outage",
    blurb: "The bank is not answering. Switching rail should beat waiting.",
  },
  {
    id: "insufficient_funds",
    label: "Insufficient funds",
    blurb: "The account is empty. Switching rail cannot help; waiting for payday can.",
  },
  {
    id: "network_timeout",
    label: "Network timeout",
    blurb: "A transient failure. An immediate retry is often enough.",
  },
] as const;

type ScenarioId = (typeof SCENARIOS)[number]["id"];
type Stage = "idle" | "publishing" | "waiting" | "ready" | "failed";

const POLL_INTERVAL_MS = 900;
const POLL_TIMEOUT_MS = 25000;

export default function CheckoutPage(): React.ReactElement {
  const { merchantId } = useMerchant();
  const [amountRupees, setAmountRupees] = useState("1850");
  const [scenario, setScenario] = useState<ScenarioId>("issuer_outage");
  const [stage, setStage] = useState<Stage>("idle");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [autopsy, setAutopsy] = useState<AutopsyView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<{ poll?: ReturnType<typeof setInterval>; stop?: ReturnType<typeof setTimeout> }>({});

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
      setError("Enter an amount greater than zero.");
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
      setError("Could not reach the console API.");
      setStage("failed");
      return;
    }

    setAttemptId(published.payment_attempt_id);
    setStage("waiting");

    // Poll the ordinary read path. The event went through Kafka, so there is a
    // genuine gap before the row exists -- that gap is the system working, not
    // a loading spinner standing in for one.
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
        // Keep polling; the timeout below is the backstop.
      }
    }, POLL_INTERVAL_MS);

    timers.current.stop = setTimeout(() => {
      clearTimers();
      setStage((current) => {
        if (current === "ready") return current;
        setError(
          "The event was published but never appeared in the read path. The consumer may not be running.",
        );
        return "failed";
      });
    }, POLL_TIMEOUT_MS);
  };

  const openRazorpay = () => {
    const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    if (!key) {
      setError(
        "NEXT_PUBLIC_RAZORPAY_KEY_ID is not set. Add your own Razorpay test key id to .env to use the live checkout.",
      );
      return;
    }
    if (typeof window.Razorpay === "undefined") {
      setError("The Razorpay checkout script has not loaded yet.");
      return;
    }
    const rzp = new window.Razorpay({
      key,
      amount: Math.round(Number(amountRupees) * 100),
      currency: "INR",
      name: "Salvage demo merchant",
      description: "Razorpay test-mode checkout",
      theme: { color: "#0f172a" },
    });
    rzp.open();
  };

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="w-full space-y-6 flex flex-col items-center text-center">
        <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 flex flex-col items-center">
          <h2 className="text-base sm:text-lg font-serif font-bold text-slate-900 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
            Publish a failure, watch the pipeline
          </h2>
          <p className="text-xs text-slate-500 max-w-xl mt-1.5">
            This publishes a real <code className="font-mono">payment_failed.v1</code> event to
            Kafka for <span className="font-mono text-slate-700">{merchantId}</span>. The ordinary
            consumer ingests it and this page polls the ordinary read path — nothing here is
            simulated in the browser.
          </p>

          <div className="w-full max-w-2xl mt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {SCENARIOS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setScenario(option.id)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    scenario === option.id
                      ? "border-emerald-400 bg-emerald-50/70 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span className="block text-xs font-bold text-slate-900">{option.label}</span>
                  <span className="block text-[10px] text-slate-500 mt-1 leading-snug">
                    {option.blurb}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-end gap-3">
              <label className="flex-1 text-left w-full">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                  Amount (₹)
                </span>
                <input
                  value={amountRupees}
                  onChange={(event) => setAmountRupees(event.target.value)}
                  inputMode="decimal"
                  className="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-mono shadow-sm"
                />
              </label>

              <button
                onClick={run}
                disabled={stage === "publishing" || stage === "waiting"}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-mono font-semibold inline-flex items-center gap-2 transition-all shadow-sm shrink-0"
              >
                {stage === "publishing" || stage === "waiting" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                {stage === "publishing"
                  ? "Publishing…"
                  : stage === "waiting"
                    ? "Waiting for ingest…"
                    : "Publish failure event"}
              </button>

              <button
                onClick={openRazorpay}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:border-slate-400 text-slate-800 text-xs font-mono font-semibold transition-all shrink-0"
                title="Opens Razorpay test-mode checkout, if a key is configured"
              >
                Razorpay test checkout
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-[11px] font-mono text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 max-w-2xl">
              {error}
            </p>
          )}

          {attemptId && (
            <p className="mt-4 text-[11px] font-mono text-slate-500">
              attempt <span className="text-slate-800">{attemptId}</span>
            </p>
          )}
        </div>

        {stage === "ready" && autopsy && (
          <PipelineResult autopsy={autopsy} merchantId={merchantId} />
        )}
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
    <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 flex flex-col items-center">
      <div className="flex items-center gap-2 mb-5">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <h3 className="text-base font-serif font-bold text-slate-900">Ingested and processed</h3>
      </div>

      <div className="w-full max-w-3xl space-y-3 text-left">
        <Step
          index={1}
          title="Ingested"
          detail={`${formatRupeesDetailed(attempt.amount_paise)} on ${attempt.issuer}|${attempt.payment_method}, ${attempt.failures.length} failure event${attempt.failures.length === 1 ? "" : "s"} recorded.`}
        />
        <Step
          index={2}
          title="Diagnosed"
          detail={
            diagnosis
              ? `${diagnosis.taxonomy_code} at ${(diagnosis.confidence * 100).toFixed(1)}% confidence — rail sensed ${diagnosis.rail_state}.`
              : "The diagnosis engine returned nothing for this attempt."
          }
          muted={!diagnosis}
        />
        <Step
          index={3}
          title="Decided"
          detail={
            decision
              ? `${decision.chosen_action} — P(recovery) ${(decision.recovery_probability * 100).toFixed(1)}%, expected net ${formatRupeesDetailed(decision.expected_net_value_paise)}.`
              : "The policy engine returned no decision for this attempt."
          }
          muted={!decision}
        />
        <Step
          index={4}
          title="Recorded"
          detail={
            ledger.length > 0
              ? `${ledger.length} ledger entr${ledger.length === 1 ? "y" : "ies"} reference this attempt; latest hash ${ledger[0].entry_hash.slice(0, 16)}…`
              : "No ledger entry references this attempt. Nothing was executed against it."
          }
          muted={ledger.length === 0}
        />
      </div>

      <Link
        href={`/autopsy/${encodeURIComponent(attempt.payment_attempt_id)}?merchant=${encodeURIComponent(merchantId)}`}
        className="mt-6 text-xs font-mono text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1.5"
      >
        Open the full autopsy
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

function Step({
  index,
  title,
  detail,
  muted,
}: {
  index: number;
  title: string;
  detail: string;
  muted?: boolean;
}): React.ReactElement {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
        muted ? "border-slate-200 bg-slate-50/60" : "border-emerald-200 bg-emerald-50/50"
      }`}
    >
      <span
        className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
          muted ? "bg-slate-200 text-slate-600" : "bg-emerald-600 text-white"
        }`}
      >
        {index}
      </span>
      <div>
        <span className="block text-xs font-bold text-slate-900">{title}</span>
        <span className="block text-[11px] text-slate-600 font-mono mt-0.5 leading-relaxed">
          {detail}
        </span>
      </div>
    </div>
  );
}
