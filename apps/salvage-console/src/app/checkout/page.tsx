"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Layers,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Zap,
} from "lucide-react";
import Script from "next/script";
import { useState } from "react";
import { formatPercent, formatRupees } from "@/lib/formatters";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function CheckoutPage() {
  const [amountPaise, setAmountPaise] = useState<number>(185000);
  const [selectedMethod, setSelectedMethod] = useState<string>("SBI|UPI|RAZORPAY");
  const [processingState, setProcessingState] = useState<
    "IDLE" | "PROCESSING" | "FAILED" | "RECOVERING" | "RECOVERED"
  >("IDLE");
  const [activeFailureMode, setActiveFailureMode] = useState<string | null>(null);
  const [recoveryLog, setRecoveryLog] = useState<string[]>([]);
  const [recoveredPayload, setRecoveredPayload] = useState<any>(null);

  // Trigger Simulated In-App Payment Failure & Autonomous Recovery
  const handleSimulatePayment = (mode: "SBI_OUTAGE" | "LOW_BALANCE" | "TIMEOUT") => {
    setProcessingState("PROCESSING");
    setActiveFailureMode(mode);
    setRecoveryLog(["1. Ingesting payment failure event into Redpanda Kafka topic..."]);

    setTimeout(() => {
      setProcessingState("FAILED");

      setTimeout(() => {
        setProcessingState("RECOVERING");
        if (mode === "SBI_OUTAGE") {
          setRecoveryLog([
            "1. Ingested failure: SBI|UPI|RAZORPAY (Code: U30 - Switch Outage)",
            "2. Sensing Matrix: Corroborated with 34 other merchants (SBI error rate = 88.4%)",
            "3. Causal Diagnosis: ISSUER_OUTAGE (96% confidence, systemic bank outage)",
            "4. Expected Net Utility Calculus: Evaluated 5 actions -> Winner: SWITCH_RAIL",
            "5. Safety Bounds Gate: AttemptCap (1/3), QuietHours (Permitted), OptOut (Active)",
            "6. Distributed Lock: Acquired Redis lock 'lock:cust_90124'",
            "7. Ledger Commit: Appended sha256 hash block #48220",
            "8. Autonomous Action: Instantly switching rail to HDFC UPI alternative!",
          ]);
          setRecoveredPayload({
            action: "SWITCH_RAIL",
            targetRail: "HDFC|UPI|RAZORPAY",
            grossRecovered: amountPaise,
            netUtility: amountPaise - 75,
            message: "Autonomous reroute succeeded via HDFC Bank UPI rail.",
          });
        } else if (mode === "LOW_BALANCE") {
          setRecoveryLog([
            "1. Ingested failure: HDFC|CARD|RAZORPAY (Code: U69 - Insufficient Balance)",
            "2. Sensing Matrix: Rail is HEALTHY (Isolated account liquidity failure)",
            "3. Causal Diagnosis: INSUFFICIENT_FUNDS (Calendar salary cycle analysis)",
            "4. Expected Net Utility Calculus: Winner: RETRY_SCHEDULED (Post-salary credit)",
            "5. Safety Bounds Gate: AttemptCap (1/3), QuietHours (Permitted)",
            "6. Ledger Commit: Appended sha256 hash block #48221",
            "7. Autonomous Action: Retry scheduled for 1st of month 09:30 IST (liquidity window).",
          ]);
          setRecoveredPayload({
            action: "RETRY_SCHEDULED",
            targetRail: "HDFC|CARD|RAZORPAY",
            grossRecovered: amountPaise,
            netUtility: amountPaise - 70,
            message: "Retry scheduled post-salary credit window to prevent gateway fee waste.",
          });
        } else {
          setRecoveryLog([
            "1. Ingested failure: AXIS|NB|RAZORPAY (Code: TIMEOUT - Network Drop)",
            "2. Sensing Matrix: Transient network jitter detected",
            "3. Causal Diagnosis: NETWORK_TIMEOUT (Transient transience score = 0.92)",
            "4. Expected Net Utility Calculus: Winner: RETRY_IMMEDIATE",
            "5. Safety Bounds Gate: AttemptCap (1/3) Passed",
            "6. Ledger Commit: Appended sha256 hash block #48222",
            "7. Autonomous Action: Immediate retry executed successfully on backoff.",
          ]);
          setRecoveredPayload({
            action: "RETRY_IMMEDIATE",
            targetRail: "AXIS|NB|RAZORPAY",
            grossRecovered: amountPaise,
            netUtility: amountPaise - 50,
            message: "Transient timeout resolved via immediate jittered backoff retry.",
          });
        }

        setTimeout(() => {
          setProcessingState("RECOVERED");
        }, 1200);
      }, 900);
    }, 800);
  };

  // Trigger Real Razorpay In-App Standard Checkout Modal
  const handleOpenRazorpayModal = () => {
    if (typeof window.Razorpay === "undefined") {
      alert("Razorpay Checkout SDK is loading... please try again in a moment.");
      return;
    }

    const options = {
      key: "rzp_test_9nTp8gSSLXAvog",
      amount: amountPaise,
      currency: "INR",
      name: "Salvage Merchant Demo",
      description: "In-App Payment Recovery Test",
      image: "https://cdn.razorpay.com/static/assets/logo/rzp.png",
      prefill: {
        name: "Demo Customer",
        email: "customer@salvage.local",
        contact: "9876543210",
      },
      theme: {
        color: "#10b981",
      },
      handler: function (response: any) {
        alert("Payment Successful on Razorpay Test Mode! Payment ID: " + response.razorpay_payment_id);
      },
      modal: {
        ondismiss: function () {
          // Trigger autonomous recovery preview on user abandonment
          handleSimulatePayment("TIMEOUT");
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      <div className="space-y-6">
        {/* Header */}
        <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-400" />
                Live In-Project Checkout & Autonomous Recovery Simulator
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Trigger real-world payment failures inside this app and watch Salvage diagnose, bound, and recover them in real time
              </p>
            </div>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Razorpay Test Key Active
            </span>
          </div>
        </div>

        {/* 2-Column Layout: Checkout on Left, Recovery Pipeline on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: Checkout Card */}
          <div className="lg:col-span-5 rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm font-mono text-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 font-sans">
                <span className="text-sm font-bold text-slate-100">Merchant Checkout</span>
                <span className="text-xs text-slate-400">Swiggy Gourmet Delivery</span>
              </div>

              {/* Order Items */}
              <div className="py-3.5 space-y-2 border-b border-slate-800/60 text-[11px]">
                <div className="flex justify-between text-slate-300">
                  <span>1x Chef's Gourmet Tasting Box</span>
                  <span className="text-slate-100 font-semibold">₹1,450.00</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>1x Artisanal Belgian Dessert</span>
                  <span className="text-slate-100 font-semibold">₹400.00</span>
                </div>
                <div className="flex justify-between text-slate-400 pt-1 text-[10px]">
                  <span>Delivery & GST</span>
                  <span className="text-emerald-400 font-semibold">FREE (Salvage Pass)</span>
                </div>
              </div>

              {/* Total */}
              <div className="py-3 flex justify-between items-center text-xs">
                <span className="text-slate-400 uppercase tracking-wider font-sans">Total Amount</span>
                <span className="text-lg font-bold text-emerald-400 font-mono">
                  {formatRupees(amountPaise)}
                </span>
              </div>

              {/* Payment Methods */}
              <div className="mt-2 space-y-2">
                <label className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                  Select Simulated Payment Rail
                </label>

                <div
                  onClick={() => setSelectedMethod("SBI|UPI|RAZORPAY")}
                  className={`p-2.5 rounded border cursor-pointer flex items-center justify-between transition-colors ${
                    selectedMethod === "SBI|UPI|RAZORPAY"
                      ? "bg-rose-950/30 border-rose-800 text-rose-300"
                      : "bg-slate-900 border-slate-800 text-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span>State Bank of India (UPI)</span>
                  </div>
                  <span className="text-[10px] text-rose-400 font-bold">DEGRADED RAIL</span>
                </div>

                <div
                  onClick={() => setSelectedMethod("HDFC|UPI|RAZORPAY")}
                  className={`p-2.5 rounded border cursor-pointer flex items-center justify-between transition-colors ${
                    selectedMethod === "HDFC|UPI|RAZORPAY"
                      ? "bg-emerald-950/30 border-emerald-800 text-emerald-300"
                      : "bg-slate-900 border-slate-800 text-slate-400"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>HDFC Bank (UPI)</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-bold">HEALTHY</span>
                </div>
              </div>
            </div>

            {/* Simulation Action Buttons */}
            <div className="mt-5 pt-4 border-t border-slate-800 space-y-2.5 font-sans">
              <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Test Failure Ingestion Scenarios:</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => handleSimulatePayment("SBI_OUTAGE")}
                  className="px-2.5 py-2 rounded bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-200 text-[11px] font-semibold transition-colors text-left flex flex-col"
                >
                  <span className="font-bold">1. SBI Outage</span>
                  <span className="text-[9px] text-rose-400 font-mono">Code U30</span>
                </button>

                <button
                  onClick={() => handleSimulatePayment("LOW_BALANCE")}
                  className="px-2.5 py-2 rounded bg-amber-950 hover:bg-amber-900 border border-amber-800 text-amber-200 text-[11px] font-semibold transition-colors text-left flex flex-col"
                >
                  <span className="font-bold">2. Low Balance</span>
                  <span className="text-[9px] text-amber-400 font-mono">Code U69</span>
                </button>

                <button
                  onClick={() => handleSimulatePayment("TIMEOUT")}
                  className="px-2.5 py-2 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 text-indigo-200 text-[11px] font-semibold transition-colors text-left flex flex-col"
                >
                  <span className="font-bold">3. Timeout</span>
                  <span className="text-[9px] text-indigo-400 font-mono">Transient</span>
                </button>
              </div>

              {/* Real Razorpay Popup Button */}
              <button
                onClick={handleOpenRazorpayModal}
                className="w-full mt-2 px-4 py-2.5 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
              >
                <CreditCard className="w-4 h-4" />
                <span>Open Real Razorpay Popup Checkout Modal</span>
              </button>
            </div>
          </div>

          {/* RIGHT: Live Autonomous Salvage Pipeline Monitor */}
          <div className="lg:col-span-7 rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm font-mono text-xs flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold font-sans text-slate-100">
                  Salvage Autonomous Recovery Engine Monitor
                </h3>
              </div>
              <span className="text-[10px] text-slate-400">Sub-50ms SLA Execution</span>
            </div>

            {/* Pipeline State Display */}
            {processingState === "IDLE" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
                <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 mb-3">
                  <Zap className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-slate-300 font-sans">Pipeline Standing By</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1 font-sans">
                  Select a payment failure scenario on the left or open the real Razorpay checkout modal to watch Salvage process and recover the transaction in real time.
                </p>
              </div>
            )}

            {processingState === "PROCESSING" && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
                <span className="text-sm font-semibold text-slate-200 font-sans">
                  Intercepting Payment Attempt...
                </span>
                <span className="text-xs text-slate-500 mt-1">
                  Ingesting failure payload into Redpanda Kafka topic
                </span>
              </div>
            )}

            {(processingState === "FAILED" ||
              processingState === "RECOVERING" ||
              processingState === "RECOVERED") && (
              <div className="mt-3 space-y-3 flex-1 flex flex-col justify-between">
                {/* Steps Log */}
                <div className="p-3.5 rounded bg-slate-900/80 border border-slate-800 space-y-1.5 text-[11px]">
                  {recoveryLog.map((log, index) => (
                    <div
                      key={index}
                      className={`flex items-start gap-2 ${
                        index === recoveryLog.length - 1
                          ? "text-emerald-300 font-semibold"
                          : "text-slate-400"
                      }`}
                    >
                      <span className="text-emerald-400">›</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>

                {/* Final Recovery Card */}
                {processingState === "RECOVERED" && recoveredPayload && (
                  <div className="p-4 rounded border border-emerald-800/80 bg-gradient-to-r from-emerald-950/40 to-slate-900 font-mono text-xs">
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs uppercase font-sans">
                        <CheckCircle2 className="w-4 h-4" />
                        RECOVERY ACTION EXECUTED & AUDITED
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold">
                        {recoveredPayload.action}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 mt-2">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Target Rail</span>
                        <span className="font-semibold text-slate-100">{recoveredPayload.targetRail}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 block text-[10px]">Expected Net Salvaged</span>
                        <span className="font-bold text-emerald-400">
                          {formatRupees(recoveredPayload.netUtility)}
                        </span>
                      </div>
                    </div>

                    <p className="mt-2.5 pt-2 border-t border-emerald-900/50 text-[11px] text-slate-300 font-sans">
                      {recoveredPayload.message}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
