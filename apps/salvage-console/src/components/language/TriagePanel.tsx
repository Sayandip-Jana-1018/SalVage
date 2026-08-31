"use client";

import { FileSearch, Loader2 } from "lucide-react";
import React, { useState } from "react";
import {
  LanguageOffLine,
  Provenance,
  useLanguageStatus,
} from "@/components/language/LanguageGate";
import { RefusalNotice } from "@/components/language/NarrationPanel";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Chip } from "@/components/ui/Primitives";
import { usePostApi } from "@/lib/useApi";
import type { TriageResponse } from "@/types";

/**
 * Propose a taxonomy mapping for a decline code nothing recognises.
 *
 * Three constraints hold this feature in place, and the panel shows all three
 * rather than hiding them behind a clean result:
 *
 * - **Only unmapped codes.** A code the deterministic mapper already resolves
 *   comes back 409. Consulting a model about an answer you already have is how
 *   a verified mapping gets quietly replaced by a plausible one.
 * - **No confidence.** The proposal carries a rationale and the name of the
 *   specification that would settle it. A number attached to "this code means
 *   X" is a claim about the outside world, which ADR-0006 forbids, and it is
 *   the shape that gets pasted straight into the table.
 * - **Never applied.** There is no endpoint in this repository that writes the
 *   mapper. A human edits `taxonomy/mapper.py` or nothing changes.
 */
export function TriagePanel(): React.ReactElement {
  const status = useLanguageStatus();
  const triage = usePostApi<TriageResponse>("/api/language/triage");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");

  const enabled = status.data?.enabled === true;

  return (
    <Panel>
      <PanelHeader
        eyebrow="Language layer · proposes only"
        title="Unknown decline-code triage"
        note="Gateways return free-text error codes. The deterministic mapper knows the ones somebody wrote down; everything else fails closed at UNKNOWN, correctly, and tells nobody anything. This asks a model what an unrecognised code looks like, and files the answer for a human to check."
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
                if (!code.trim()) return;
                triage.run({
                  provider_error_code: code.trim(),
                  provider_error_description: description.trim() || null,
                });
              }}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <label className="block sm:w-44">
                <span className="eyebrow">Provider error code</span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="ZZ42"
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.035] px-3 py-2 font-mono text-xs text-fg placeholder:text-fg-faint/70 outline-none transition-colors focus:border-iris/60"
                />
              </label>
              <label className="block flex-1">
                <span className="eyebrow">Provider description (optional)</span>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="whatever text the gateway sent alongside it"
                  className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.035] px-3 py-2 text-xs text-fg placeholder:text-fg-faint/70 outline-none transition-colors focus:border-iris/60"
                />
              </label>
              <button
                type="submit"
                disabled={!code.trim() || triage.phase === "loading"}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-iris/40 bg-iris/10 px-4 py-2 font-mono text-xs font-semibold text-iris transition-colors hover:bg-iris/15 disabled:opacity-40"
              >
                {triage.phase === "loading" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileSearch className="h-3.5 w-3.5" />
                )}
                Propose
              </button>
            </form>

            {triage.phase === "failed" ? (
              <RefusalNotice status={triage.status} error={triage.error} />
            ) : null}

            {triage.data ? <Proposal response={triage.data} /> : null}
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

function Proposal({ response }: { response: TriageResponse }): React.ReactElement {
  const { proposal } = response;
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.035] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] pb-3">
        <span className="state-degraded state-chip rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider">
          proposal · pending human review
        </span>
        <span className="font-mono text-[10px] text-fg-faint">
          applied: {String(response.applied)} ·{" "}
          {response.queued_to ? `queued to ${response.queued_to}` : "not persisted"}
        </span>
      </div>

      <dl className="mt-3 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="eyebrow">Code</dt>
          <dd className="mt-1.5 font-mono text-xs text-fg">{response.provider_error_code}</dd>
        </div>
        <div>
          <dt className="eyebrow">Maps today</dt>
          <dd className="mt-1.5 font-mono text-xs text-fg-muted">{response.current_mapping}</dd>
        </div>
        <div>
          <dt className="eyebrow">Proposed</dt>
          <dd className="mt-1.5 font-mono text-xs font-semibold text-iris">
            {proposal.proposed_taxonomy_code}
          </dd>
        </div>
      </dl>

      <div className="mt-3.5 flex flex-wrap gap-1.5">
        <Chip tone={proposal.is_retryable_same_rail ? "accent" : "neutral"}>
          retry same rail: {String(proposal.is_retryable_same_rail)}
        </Chip>
        <Chip tone={proposal.is_retryable_alternative_rail ? "accent" : "neutral"}>
          retry other rail: {String(proposal.is_retryable_alternative_rail)}
        </Chip>
      </div>

      <p className="mt-3.5 max-w-2xl text-[12px] leading-relaxed text-fg">{proposal.rationale}</p>

      <p className="mt-2.5 text-[11px] leading-relaxed text-fg-muted">
        <span className="eyebrow">Check against</span>{" "}
        <span className="font-mono text-fg">{proposal.specification_to_check}</span> — no confidence
        value was requested from the model. Whoever reads that document sets one, in{" "}
        <span className="font-mono">taxonomy/mapper.py</span>, in a change someone else can see.
      </p>

      <Provenance
        model={response.model}
        promptSha256={response.prompt_sha256}
        generatedAt={response.generated_at}
      />
    </div>
  );
}
