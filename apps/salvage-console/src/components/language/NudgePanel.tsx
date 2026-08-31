"use client";

import { Loader2, MessageSquare } from "lucide-react";
import React, { useState } from "react";
import {
  LanguageOffLine,
  Provenance,
  useLanguageStatus,
} from "@/components/language/LanguageGate";
import { RefusalNotice } from "@/components/language/NarrationPanel";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { formatPaise } from "@/lib/formatters";
import { usePostApi } from "@/lib/useApi";
import type { NudgeCopy } from "@/types";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "bn", label: "Bengali" },
  { code: "mr", label: "Marathi" },
] as const;

const CHANNELS = ["SMS", "WHATSAPP", "EMAIL"] as const;

const CAUSES = [
  "INSUFFICIENT_FUNDS",
  "ISSUER_OUTAGE",
  "CARD_EXPIRED",
  "MANDATE_INVALID",
  "NETWORK_TIMEOUT",
] as const;

/**
 * Customer copy, in the customer's language.
 *
 * The policy engine decides whether to contact anyone; this only writes the
 * sentence. What makes it safe is small and mechanical: **the model may not
 * write a digit.** It returns a template containing `{amount}` and
 * `{merchant}`, and the service substitutes them, formatting the amount from
 * integer paise.
 *
 * Both are shown below — the template the model produced and the message it
 * renders to — because the gap between them is the point. A model that
 * hallucinates ₹18,500 instead of ₹1,850 has no channel through which to do it.
 */
export function NudgePanel(): React.ReactElement {
  const status = useLanguageStatus();
  const nudge = usePostApi<NudgeCopy>("/api/language/nudge");

  const [merchantName, setMerchantName] = useState("Demo Merchant");
  const [amount, setAmount] = useState("1850");
  const [language, setLanguage] = useState<string>("hi");
  const [channel, setChannel] = useState<string>("SMS");
  const [cause, setCause] = useState<string>("INSUFFICIENT_FUNDS");

  const enabled = status.data?.enabled === true;
  const paise = Math.round(Number(amount) * 100);

  return (
    <Panel>
      <PanelHeader
        eyebrow="Language layer · writes words, not numbers"
        title="Multilingual nudge copy"
        note="A message to a customer in Chennai reads better in Tamil, and a system that only speaks English quietly turns a recoverable payment into an ignored SMS. Generating copy is not sending it: nothing in salvage-brain has an outbound channel to a customer."
      />

      <PanelBody className="space-y-4">
        {!enabled ? (
          <LanguageOffLine
            status={status.data}
            unreachable={status.phase === "unavailable"}
          />
        ) : (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!Number.isFinite(paise) || paise < 1) return;
                nudge.run({
                  merchant_display_name: merchantName,
                  amount_paise: paise,
                  language,
                  channel,
                  taxonomy_code: cause,
                });
              }}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
            >
              <label className="block">
                <span className="eyebrow">Merchant name</span>
                <input
                  value={merchantName}
                  onChange={(event) => setMerchantName(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.035] px-3 py-2 text-xs text-fg outline-none transition-colors focus:border-iris/60"
                />
              </label>

              <label className="block">
                <span className="eyebrow">Amount (₹)</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.035] px-3 py-2 font-mono text-xs text-fg outline-none transition-colors focus:border-iris/60"
                />
              </label>

              <Select label="Language" value={language} onChange={setLanguage}>
                {LANGUAGES.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </Select>

              <Select label="Channel" value={channel} onChange={setChannel}>
                {CHANNELS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>

              <Select label="Cause" value={cause} onChange={setCause}>
                {CAUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>

              <div className="lg:col-span-5">
                <button
                  type="submit"
                  disabled={nudge.phase === "loading"}
                  className="inline-flex items-center gap-2 rounded-lg border border-iris/40 bg-iris/10 px-4 py-2 font-mono text-xs font-semibold text-iris transition-colors hover:bg-iris/15 disabled:opacity-40"
                >
                  {nudge.phase === "loading" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5" />
                  )}
                  Write copy
                </button>
              </div>
            </form>

            <p className="font-mono text-[10px] text-fg-faint">
              the request carries no customer name, phone, email or id — the request type has no
              field for one
            </p>

            {nudge.phase === "failed" ? (
              <RefusalNotice status={nudge.status} error={nudge.error} />
            ) : null}

            {nudge.data ? <Copy copy={nudge.data} /> : null}
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

function Copy({ copy }: { copy: NudgeCopy }): React.ReactElement {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-4">
        <p className="eyebrow mb-2">What the model wrote — no digits anywhere</p>
        <p className="font-mono text-[12px] leading-relaxed text-fg-muted">{copy.template}</p>
      </div>

      <div className="rounded-xl border border-iris/30 bg-iris/[0.06] p-4">
        <p className="eyebrow mb-2">
          What is sent — {copy.channel}, amount rendered from {copy.amount_paise} paise
        </p>
        <p className="text-[13px] leading-relaxed text-fg">{copy.rendered}</p>
        <p className="num mt-2.5 font-mono text-[10px] text-fg-faint">
          {formatPaise(copy.amount_paise)} formatted by the console&apos;s own integer arithmetic ·
          sent: {String(copy.sent)}
        </p>
      </div>

      <Provenance
        model={copy.model}
        promptSha256={copy.prompt_sha256}
        generatedAt={copy.generated_at}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.035] px-3 py-2 font-mono text-xs text-fg outline-none transition-colors focus:border-iris/60"
      >
        {children}
      </select>
    </label>
  );
}
