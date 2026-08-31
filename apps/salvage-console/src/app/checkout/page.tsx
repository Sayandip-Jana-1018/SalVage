"use client";

import { ArrowRight, Check, Loader2, Zap } from "lucide-react";
import Link from "next/link";
import Script from "next/script";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Mono } from "@/components/ui/Primitives";
import { formatPaise, formatPercent } from "@/lib/formatters";
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
 * chain of `setTimeout` calls printing lines like "Sensing Matrix: Corroborated
 * with 34 other merchants (SBI error rate = 88.4%)" and "Ledger Commit:
 * Appended sha256 hash block #48220". Nothing was contacted, no event existed,
 * and the block number was a literal.
 *
 * What happens now: the button publishes a `payment_failed.v1` event to Kafka
 * through salvage-core, the ordinary consumer ingests it, and this page polls
 * the ordinary read path until the attempt appears — then shows whatever the
 * diagnosis engine, the policy engine and the ledger actually produced. If the
 * pipeline is slow the page waits; if a stage produces nothing it says so.
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
    // genuine gap before the row exists — that gap is the system working, not a
    // loading spinner standing in for one.
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
    new window.Razorpay({
      key,
      amount: Math.round(Number(amountRupees) * 100),
      currency: "INR",
      name: "Salvage demo merchant",
      description: "Razorpay test-mode checkout",
      theme: { color: "#05070a" },
    }).open();
  };

  const busy = stage === "publishing" || stage === "waiting";

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="space-y-6">
        <ConnectionBanner />
        <Panel index={0}>
          <PanelHeader
            eyebrow="Real event, real pipeline"
            title="Publish a failure and follow it"
            note={
              <>
                Publishes a real <span className="font-mono">payment_failed.v1</span> event to Kafka
                for <span className="font-mono text-fg-muted">{merchantId}</span>. The ordinary
                consumer ingests it and this page polls the ordinary read path — nothing here is
                simulated in the browser.
              </>
            }
          />

          <PanelBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {SCENARIOS.map((option) => {
                const selected = scenario === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setScenario(option.id)}
                    className={`rounded-2xl border p-4 text-left transition-all duration-300 ${
                      selected
                        ? "border-iris/45 bg-iris/[0.08]"
                        : "border-white/[0.07] bg-white/[0.035] hover:border-white/12"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                      {selected ? <Check className="h-3 w-3 text-iris" /> : null}
                      {option.label}
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug text-fg-muted">
                      {option.blurb}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Centred, and both buttons built to one spec. They previously sat
                hard left under a full-width row of cards, and disagreed with
                each other about capitalisation and weight -- one lowercase and
                iris, one title case and grey -- which reads as two controls
                from two different screens. */}
            <div className="flex flex-col items-center gap-4 border-t border-white/[0.06] pt-6 sm:flex-row sm:justify-center sm:gap-5">
              <label className="w-full sm:w-44">
                <span className="eyebrow block text-center">Amount (₹)</span>
                <input
                  value={amountRupees}
                  onChange={(event) => setAmountRupees(event.target.value)}
                  inputMode="decimal"
                  aria-label="Amount in rupees"
                  className="num mt-2 h-10 w-full rounded-xl border border-white/12 bg-white/[0.035] px-3.5 text-center font-mono text-[13px] text-fg outline-none transition-colors focus:border-iris/60"
                />
              </label>

              <div className="flex w-full flex-col gap-3 sm:mt-[26px] sm:w-auto sm:flex-row">
                <button
                  onClick={run}
                  disabled={busy}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-iris/40 bg-iris/12 px-5 text-[13px] font-semibold text-iris transition-all duration-300 hover:border-iris/60 hover:bg-iris/20 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  {stage === "publishing"
                    ? "Publishing"
                    : stage === "waiting"
                      ? "Waiting for ingest"
                      : "Publish failure event"}
                </button>

                <button
                  onClick={openRazorpay}
                  title="Opens Razorpay test-mode checkout, if a key is configured"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-5 text-[13px] font-medium text-fg-muted transition-all duration-300 hover:border-white/20 hover:text-fg"
                >
                  Razorpay test checkout
                </button>
              </div>
            </div>

            {attemptId ? (
              <p className="text-center font-mono text-[11px] text-fg-faint">
                attempt <Mono value={attemptId} className="text-fg" />
              </p>
            ) : null}

            {error ? (
              <div className="state-down state-tile rounded-xl p-3.5">
                <p className="font-mono text-[11px] leading-relaxed text-down">{error}</p>
              </div>
            ) : null}
          </PanelBody>
        </Panel>

        {stage === "ready" && autopsy ? (
          <PipelineResult autopsy={autopsy} merchantId={merchantId} />
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
    <Panel index={1}>
      <PanelHeader
        eyebrow="Round trip complete"
        title="Ingested and processed"
        note="Each step below reports what a service actually produced. A step that produced nothing says so rather than being skipped."
      />
      <PanelBody className="space-y-2.5">
        <Step
          index={1}
          title="Ingested"
          detail={`${formatPaise(attempt.amount_paise)} on ${attempt.issuer}|${attempt.payment_method}, ${attempt.failures.length} failure event${attempt.failures.length === 1 ? "" : "s"} recorded.`}
        />
        <Step
          index={2}
          title="Diagnosed"
          detail={
            diagnosis
              ? `${diagnosis.taxonomy_code} at ${formatPercent(diagnosis.confidence)} confidence — rail sensed ${diagnosis.rail_state}.`
              : "The diagnosis engine returned nothing for this attempt."
          }
          muted={!diagnosis}
        />
        <Step
          index={3}
          title="Decided"
          detail={
            decision
              ? `${decision.chosen_action} — P(recovery) ${formatPercent(decision.recovery_probability)}, expected net ${formatPaise(decision.expected_net_value_paise)}.`
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

        <Link
          href={`/autopsy/${encodeURIComponent(attempt.payment_attempt_id)}?merchant=${encodeURIComponent(merchantId)}`}
          className="inline-flex items-center gap-1.5 pt-1 font-mono text-[11px] text-iris transition-colors hover:underline"
        >
          open the full autopsy
          <ArrowRight className="h-3 w-3" />
        </Link>
      </PanelBody>
    </Panel>
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
      className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 ${
        muted ? "border-white/[0.07] bg-white/[0.035]" : "border-healthy/25 bg-healthy/[0.05]"
      }`}
    >
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold ${
          muted ? "bg-white/[0.08] text-fg-faint" : "bg-healthy/20 text-healthy"
        }`}
      >
        {index}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-fg">{title}</p>
        <p className="num mt-0.5 font-mono text-[11px] leading-relaxed text-fg-muted">{detail}</p>
      </div>
    </div>
  );
}
