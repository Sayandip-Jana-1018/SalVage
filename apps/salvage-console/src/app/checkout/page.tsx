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
import React, { useState } from "react";
import { formatPercent, formatRupees } from "@/lib/formatters";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function CheckoutPage(): React.ReactElement {
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
        color: "#0f172a",
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

      <div className="w-full space-y-6 flex flex-col items-center text-center">
        {/* Header */}
        <div className="w-full rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 flex flex-col items-center text-center">
          <div className="flex flex-col items-center justify-center space-y-1">
            <h2 className="text-base sm:text-lg font-serif font-bold text-slate-900 flex items-center justify-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-600" />
              Live In-Project Checkout & Autonomous Recovery Simulator
            </h2>
            <p className="text-xs text-slate-500 max-w-lg">
              Trigger real-world payment failures inside this app and watch Salvage diagnose, bound, and recover them in real time
            </p>
            <div className="pt-2">
              <span className="text-[11px] font-mono px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold inline-flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Razorpay Test Key Active
              </span>
            </div>
          </div>
        </div>

        {/* 2-Column Layout: Checkout on Left, Recovery Pipeline on Right */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: Checkout Card */}
          <div className="lg:col-span-5 rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 font-mono text-xs flex flex-col justify-between text-center items-center">
            <div className="w-full flex flex-col items-center">
              <div className="w-full flex flex-col items-center pb-3 border-b border-slate-100 font-sans">
                <span className="text-base font-serif font-bold text-slate-900">Merchant Checkout</span>
                <span className="text-xs text-slate-500 font-medium mt-0.5">Swiggy Gourmet Delivery</span>
              </div>

              {/* Order Items */}
              <div className="w-full py-4 space-y-2.5 border-b border-slate-100 text-xs">
                <div className="flex justify-between items-center text-slate-700 px-2">
                  <span>1x Chef's Gourmet Tasting Box</span>
                  <span className="text-slate-900 font-bold">₹1,450.00</span>
                </div>
                <div className="flex justify-between items-center text-slate-700 px-2">
                  <span>1x Artisanal Belgian Dessert</span>
                  <span className="text-slate-900 font-bold">₹400.00</span>
                </div>
                <div className="flex justify-between items-center text-slate-500 pt-1 text-[11px] px-2">
                  <span>Delivery & GST</span>
                  <span className="text-emerald-700 font-semibold">FREE (Salvage Pass)</span>
                </div>
              </div>

              {/* Total */}
              <div className="w-full py-4 flex justify-between items-center text-xs px-2 border-b border-slate-100">
                <span className="text-slate-500 uppercase tracking-wider font-sans font-semibold">Total Amount</span>
                <span className="text-2xl font-bold text-slate-900 font-mono">
                  {formatRupees(amountPaise)}
                </span>
              </div>

              {/* Payment Methods */}
              <div className="w-full mt-4 space-y-2">
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block font-sans font-semibold text-center mb-1">
                  Select Simulated Payment Rail
                </label>

                <div
                  onClick={() => setSelectedMethod("SBI|UPI|RAZORPAY")}
                  className={`p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                    selectedMethod === "SBI|UPI|RAZORPAY"
                      ? "bg-rose-50/80 border-rose-300 text-rose-900 shadow-sm"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span className="font-semibold">State Bank of India (UPI)</span>
                  </div>
                  <span className="text-[10px] text-rose-700 font-bold">DEGRADED RAIL</span>
                </div>

                <div
                  onClick={() => setSelectedMethod("HDFC|UPI|RAZORPAY")}
                  className={`p-3.5 rounded-2xl border cursor-pointer flex items-center justify-between transition-all ${
                    selectedMethod === "HDFC|UPI|RAZORPAY"
                      ? "bg-emerald-50/80 border-emerald-300 text-emerald-900 shadow-sm"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-semibold">HDFC Bank (UPI)</span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-bold">HEALTHY</span>
                </div>
              </div>
            </div>

            {/* Simulation Action Buttons */}
            <div className="w-full mt-6 pt-4 border-t border-slate-100 space-y-3 font-sans flex flex-col items-center">
              <div className="text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Test Failure Ingestion Scenarios:</span>
              </div>

              <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => handleSimulatePayment("SBI_OUTAGE")}
                  className="px-3 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-900 text-xs font-semibold transition-all text-center flex flex-col items-center shadow-sm cursor-pointer"
                >
                  <span className="font-bold">1. SBI Outage</span>
                  <span className="text-[10px] text-rose-600 font-mono">Code U30</span>
                </button>

                <button
                  onClick={() => handleSimulatePayment("LOW_BALANCE")}
                  className="px-3 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-semibold transition-all text-center flex flex-col items-center shadow-sm cursor-pointer"
                >
                  <span className="font-bold">2. Low Balance</span>
                  <span className="text-[10px] text-amber-600 font-mono">Code U69</span>
                </button>

                <button
                  onClick={() => handleSimulatePayment("TIMEOUT")}
                  className="px-3 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 text-xs font-semibold transition-all text-center flex flex-col items-center shadow-sm cursor-pointer"
                >
                  <span className="font-bold">3. Timeout</span>
                  <span className="text-[10px] text-indigo-600 font-mono">Transient</span>
                </button>
              </div>

              {/* Real Razorpay Popup Button */}
              <button
                onClick={handleOpenRazorpayModal}
                className="w-full mt-2 px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
              >
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>Open Real Razorpay Popup Checkout Modal</span>
              </button>
            </div>
          </div>

          {/* RIGHT: Live Autonomous Salvage Pipeline Monitor */}
          <div className="lg:col-span-7 rounded-2xl liquid-glass p-6 sm:p-7 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 font-mono text-xs flex flex-col items-center text-center justify-between">
            <div className="w-full flex flex-col items-center pb-3 border-b border-slate-100 space-y-1">
              <div className="flex items-center justify-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <h3 className="text-base font-serif font-bold text-slate-900">
                  Salvage Autonomous Recovery Engine Monitor
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">Sub-50ms SLA Execution · Deterministic Safety Bounds</span>
            </div>

            {/* Pipeline State Display */}
            {processingState === "IDLE" && (
              <div className="my-auto flex flex-col items-center justify-center text-center p-8 text-slate-400">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-3 shadow-inner">
                  <Zap className="w-7 h-7 text-amber-500" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800 font-sans">Pipeline Standing By</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1 font-sans">
                  Select a payment failure scenario on the left or open the real Razorpay checkout modal to watch Salvage process and recover the transaction in real time.
                </p>
              </div>
            )}

            {processingState === "PROCESSING" && (
              <div className="my-auto flex flex-col items-center justify-center p-8 text-center">
                <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin mb-3" />
                <span className="text-base font-semibold text-slate-900 font-sans">
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
              <div className="w-full mt-4 space-y-4 flex-1 flex flex-col justify-between items-center text-center">
                {/* Steps Log */}
                <div className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 text-xs text-center flex flex-col items-center">
                  {recoveryLog.map((log, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-center gap-2 ${
                        index === recoveryLog.length - 1
                          ? "text-emerald-800 font-bold"
                          : "text-slate-600"
                      }`}
                    >
                      <span className="text-emerald-600 font-bold">›</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>

                {/* Final Recovery Card */}
                {processingState === "RECOVERED" && recoveredPayload && (
                  <div className="w-full p-5 rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white font-mono text-xs shadow-sm flex flex-col items-center text-center">
                    <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
                      <span className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs uppercase font-sans">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        RECOVERY ACTION EXECUTED & AUDITED
                      </span>
                      <span className="px-3 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                        {recoveredPayload.action}
                      </span>
                    </div>

                    <div className="w-full grid grid-cols-2 gap-4 text-xs text-slate-700 py-3 border-y border-emerald-100 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-slate-400 block text-[10px]">Target Rail</span>
                        <span className="font-bold text-slate-900 mt-0.5">{recoveredPayload.targetRail}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-slate-400 block text-[10px]">Expected Net Salvaged</span>
                        <span className="font-bold text-emerald-700 mt-0.5">
                          {formatRupees(recoveredPayload.netUtility)}
                        </span>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-slate-600 font-sans max-w-md mx-auto font-medium">
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
