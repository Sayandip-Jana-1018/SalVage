"use client";

import { Languages, Loader2 } from "lucide-react";
import React from "react";
import {
  LanguageDisabledNotice,
  Provenance,
  useLanguageStatus,
} from "@/components/language/LanguageGate";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { usePostApi } from "@/lib/useApi";
import type { Narration } from "@/types";

/**
 * The decision chain, in English, for whoever is on call.
 *
 * Nothing here is a new fact. The narration is generated from the same attempt,
 * diagnosis and decision the panels above render, fetched server-side by
 * salvage-brain rather than posted from this browser — a narration endpoint
 * that narrated whatever JSON it was handed would produce official-looking
 * prose about events that never happened.
 *
 * Every number in the text has already been checked against the facts it was
 * given. A narration that introduced one was refused before it got here, and
 * the refusal arrives as a 502 with the offending figures named.
 */
export function NarrationPanel({
  merchantId,
  attemptId,
}: {
  merchantId: string;
  attemptId: string;
}): React.ReactElement {
  const status = useLanguageStatus();
  const narration = usePostApi<Narration>("/api/language/narrate");

  const enabled = status.data?.enabled === true;
  const unreachable = status.phase === "unavailable";

  return (
    <Panel>
      <PanelHeader
        eyebrow="Language layer · read only"
        title="Narrate this decision"
        note="Generated from the facts on this page. Every number in the output must already appear in them; one that does not is refused rather than corrected."
        right={
          enabled ? (
            <button
              type="button"
              onClick={() => narration.run({ merchant_id: merchantId, payment_attempt_id: attemptId })}
              disabled={narration.phase === "loading"}
              className="inline-flex items-center gap-2 rounded-lg border border-iris/40 bg-iris/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-iris transition-colors hover:bg-iris/15 disabled:opacity-50"
            >
              {narration.phase === "loading" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Languages className="h-3 w-3" />
              )}
              {narration.phase === "loading" ? "generating" : "narrate"}
            </button>
          ) : null
        }
      />

      <PanelBody>
        {!enabled ? (
          <LanguageDisabledNotice status={status.data} unreachable={unreachable} />
        ) : narration.phase === "failed" ? (
          <RefusalNotice status={narration.status} error={narration.error} />
        ) : narration.data ? (
          <div>
            <p className="max-w-3xl whitespace-pre-line text-[13px] leading-relaxed text-fg">
              {narration.data.narration}
            </p>
            <Provenance
              model={narration.data.model}
              promptSha256={narration.data.prompt_sha256}
              generatedAt={narration.data.generated_at}
            />
          </div>
        ) : (
          <p className="text-xs text-fg-muted">
            Nothing generated yet. This makes an outbound call to a third-party model, so it runs
            only when asked.
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}

/**
 * A refusal, rendered as what it is.
 *
 * 502 here does not mean something broke — it means a validator did its job.
 * Saying so is more useful than a red box, and it is the most convincing thing
 * this page can show about the boundary being real.
 */
export function RefusalNotice({
  status,
  error,
}: {
  status: number | null;
  error: string | null;
}): React.ReactElement {
  const validatorRefused = status === 502;
  return (
    <div
      className={`${validatorRefused ? "state-degraded" : "state-down"} state-tile rounded-xl p-4`}
    >
      <p className="state-text font-mono text-[10px] font-semibold uppercase tracking-wider">
        {validatorRefused ? "output refused by a validator" : `request failed · ${status ?? "?"}`}
      </p>
      <p className="mt-1.5 max-w-2xl font-mono text-[11px] leading-relaxed text-fg">{error}</p>
      {validatorRefused ? (
        <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-fg-muted">
          The model answered and the answer did not satisfy its contract, so it was thrown away
          rather than repaired. A silently corrected answer is indistinguishable from a correct
          one, which is the whole reason to check.
        </p>
      ) : null}
    </div>
  );
}
