"use client";

import { CircleSlash, Terminal } from "lucide-react";
import Link from "next/link";
import React from "react";
import { NudgePanel } from "@/components/language/NudgePanel";
import { TriagePanel } from "@/components/language/TriagePanel";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";

/**
 * The language layer, and the argument for where its edges are.
 *
 * This page exists to be read as much as used. The interesting claim Salvage
 * makes about language models is a negative one — where they are *not* — and a
 * negative claim is invisible unless something states it.
 */
export default function LanguagePage(): React.ReactElement {
  return (
    <div className="enter space-y-4">
      <Panel>
        <PanelHeader
          eyebrow="Phase 11 · ADR-0008"
          title="Language models are used where language is the problem, and never where money is"
        />
        <PanelBody className="space-y-4">
          <p className="max-w-3xl text-[13px] leading-relaxed text-fg-muted">
            The obvious thing to build is a webhook that prompts a model with &ldquo;should I retry
            this?&rdquo; and acts on the answer. It demonstrates well and fails the first question
            anyone who has operated a payment system asks: a customer disputes a double charge six
            weeks later, and the decision has to be reconstructed exactly. A hosted model cannot be
            replayed — the weights and the serving stack move under a stable model id, and
            temperature zero reduces variation without removing it. Nor can a prompt enforce
            &ldquo;never more than three retries, never inside quiet hours, never after an
            opt-out&rdquo; under adversarial input.
          </p>
          <p className="max-w-3xl text-[13px] leading-relaxed text-fg-muted">
            Both of those are already solved in this codebase, in code. So the model gets the three
            jobs below, and the boundary is enforced by a test that reads the import graph and
            fails the build if the diagnosis, policy or taxonomy code can reach the language layer
            at all.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Boundary
              allowed
              title="Where it is allowed"
              points={[
                "Proposing a taxonomy mapping for a decline code nothing recognises — filed for review, never applied.",
                "Writing customer copy in five languages, into a fixed template, forbidden from writing a digit.",
                "Narrating a decision chain the deterministic path already computed, using only numbers it was given.",
                "Answering operational questions through the five read-only MCP tools, in whatever assistant an operator already uses.",
              ]}
            />
            <Boundary
              allowed={false}
              title="Where it is not"
              points={[
                "Choosing a recovery action, or ranking one — that is an expected-value calculation that must replay bit-identically.",
                "Deciding whether an action is permitted — that is the bounds engine, holding limits in code.",
                "Reaching a PaymentProvider call. The effector is in a different service with no client for these routes.",
                "Producing any number that enters a record. Every validator here rejects rather than repairs.",
              ]}
            />
          </div>
        </PanelBody>
      </Panel>

      <TriagePanel />
      <NudgePanel />

      <Panel>
        <PanelHeader
          eyebrow="The other two"
          title="Narration and operational questions live elsewhere"
        />
        <PanelBody className="space-y-3">
          <p className="max-w-3xl text-[13px] leading-relaxed text-fg-muted">
            <strong className="font-semibold text-fg">Incident narration</strong> belongs on the
            attempt it describes, so it sits on the{" "}
            <Link href="/autopsy" className="text-iris underline underline-offset-2">
              autopsy page
            </Link>{" "}
            beneath the facts it is narrating. Every number in the output has to appear in those
            facts; one that does not is refused.
          </p>
          <p className="flex max-w-3xl items-start gap-2 text-[13px] leading-relaxed text-fg-muted">
            <Terminal className="mt-1 h-3.5 w-3.5 shrink-0 text-fg-faint" />
            <span>
              <strong className="font-semibold text-fg">Operational questions</strong> needed no new
              code. <span className="font-mono">salvage-mcp</span> has exposed five read-only tools
              since Phase 6 — <span className="font-mono">explain_decision</span>,{" "}
              <span className="font-mono">get_rail_health</span>,{" "}
              <span className="font-mono">get_recovery_stats</span>,{" "}
              <span className="font-mono">list_open_incidents</span>,{" "}
              <span className="font-mono">verify_ledger</span> — and any assistant connected to it
              can answer questions over the live services. It brings its own credentials; Salvage
              never sees them. Building a chat box here would just be a worse client for a surface
              that already exists.
            </span>
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}

function Boundary({
  allowed,
  title,
  points,
}: {
  allowed: boolean;
  title: string;
  points: string[];
}): React.ReactElement {
  return (
    <div
      className={`rounded-xl border p-4 ${
        allowed ? "border-iris/25 bg-iris/[0.05]" : "border-line bg-ink-2"
      }`}
    >
      <p className={`eyebrow mb-2.5 ${allowed ? "text-iris" : "text-fg-faint"}`}>{title}</p>
      <ul className="space-y-2">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-[12px] leading-relaxed text-fg-muted">
            {allowed ? (
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-iris" />
            ) : (
              <CircleSlash className="mt-0.5 h-3 w-3 shrink-0 text-fg-faint" />
            )}
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}
