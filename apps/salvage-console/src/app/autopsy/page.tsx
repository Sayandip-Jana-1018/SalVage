"use client";

import { ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { useMerchant } from "@/lib/merchant";

/**
 * Look up one payment attempt.
 *
 * A lookup, not a browse. The previous version listed attempts from a
 * checked-in fixture; there is no endpoint that lists attempts, because
 * neither service exposes one -- every read is by
 * (merchant_id, payment_attempt_id), which is what keeps tenant scoping
 * enforceable at the repository layer. Rather than invent a listing, this
 * asks for the id.
 */
export default function AutopsySearchPage(): React.ReactElement {
  const router = useRouter();
  const { merchantId, setMerchantId } = useMerchant();
  const [attemptId, setAttemptId] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = attemptId.trim();
    if (!trimmed) return;
    router.push(
      `/autopsy/${encodeURIComponent(trimmed)}?merchant=${encodeURIComponent(merchantId)}`,
    );
  };

  return (
    <div className="w-full flex flex-col items-center space-y-8">
      <div className="w-full rounded-2xl liquid-glass p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)] border border-slate-200/90 flex flex-col items-center text-center">
        <h1 className="text-xl sm:text-2xl font-serif font-bold text-slate-900">
          Decision Autopsy
        </h1>
        <p className="text-xs text-slate-500 max-w-xl mt-1.5">
          Reconstruct one payment attempt end to end: what was ingested, how it was classified,
          what the policy engine valued, and what the ledger recorded.
        </p>

        <form onSubmit={submit} className="w-full max-w-2xl mt-6 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="flex-1 text-left">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                Merchant id
              </span>
              <input
                value={merchantId}
                onChange={(event) => setMerchantId(event.target.value)}
                className="w-full mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500 font-mono shadow-sm"
              />
            </label>

            <label className="flex-[2] text-left">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                Payment attempt id
              </span>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  autoFocus
                  value={attemptId}
                  onChange={(event) => setAttemptId(event.target.value)}
                  placeholder="pay_..."
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono shadow-sm"
                />
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={!attemptId.trim()}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-mono font-semibold inline-flex items-center gap-2 transition-all shadow-sm"
          >
            Open autopsy
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <p className="text-[11px] text-slate-400 mt-5 max-w-xl font-mono">
          Attempt ids come from the ingest stream. Run{" "}
          <code className="px-1 py-0.5 rounded bg-slate-100">make demo</code> to publish one, or
          take an id from the ledger stream on the war room.
        </p>
      </div>
    </div>
  );
}
