"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React from "react";
import { ActionRankingTable } from "@/components/ActionRankingTable";
import { HashChainVerifier } from "@/components/HashChainVerifier";
import { NarrationPanel } from "@/components/language/NarrationPanel";
import { StateNotice } from "@/components/StateNotice";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Chip, Mono, StateChip } from "@/components/ui/Primitives";
import { formatISTTime, formatPaise, formatPercent } from "@/lib/formatters";
import { DEFAULT_MERCHANT_ID } from "@/lib/merchant";
import { useApi } from "@/lib/useApi";
import type { AutopsyView } from "@/types";

/**
 * Everything the system knows about one attempt.
 *
 * Each panel renders only if the corresponding service returned something.
 * Where there is no diagnosis or no decision, the page says so rather than
 * filling the gap. The version this replaces read a single checked-in fixture
 * and always displayed a complete, confident autopsy — including a cross-tenant
 * corroboration count, a bounds verdict with named guards, and a ledger proof
 * with a merkle root that no part of the system computes.
 */
export default function AutopsyDetailPage(): React.ReactElement {
  const params = useParams<{ attemptId: string }>();
  const search = useSearchParams();
  const attemptId = decodeURIComponent(params.attemptId);
  const merchantId = search.get("merchant") ?? DEFAULT_MERCHANT_ID;

  const { phase, data, error } = useApi<AutopsyView>(
    `/api/autopsy/${encodeURIComponent(merchantId)}/${encodeURIComponent(attemptId)}`,
  );

  return (
    <div className="enter space-y-4">
      <Link
        href="/autopsy"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] text-fg-muted transition-colors hover:text-iris"
      >
        <ArrowLeft className="h-3 w-3" />
        back to attempts
      </Link>

      {phase !== "ready" || !data ? (
        <Panel>
          <PanelHeader eyebrow="Per attempt" title={attemptId} />
          <StateNotice
            phase={phase === "ready" ? "missing" : phase}
            error={error}
            emptyTitle="No such payment attempt"
            emptyBody={`salvage-brain has no attempt ${attemptId} for merchant ${merchantId}. Nothing can be reconstructed about an attempt that was never ingested.`}
          />
        </Panel>
      ) : (
        <>
          <IngestPanel view={data} merchantId={merchantId} />
          <DiagnosisPanel view={data} />
          {data.decision ? (
            <ActionRankingTable
              actions={data.decision.candidate_valuations}
              chosenAction={data.decision.chosen_action}
            />
          ) : (
            <Panel>
              <PanelHeader eyebrow="Expected net value" title="Action ranking" />
              <StateNotice
                phase="missing"
                emptyTitle="No policy decision"
                emptyBody="The policy engine has not recorded a decision for this attempt."
              />
            </Panel>
          )}
          <NarrationPanel merchantId={merchantId} attemptId={attemptId} />
          <HashChainVerifier merchantId={merchantId} highlightAttemptId={attemptId} />
        </>
      )}
    </div>
  );
}

function IngestPanel({
  view,
  merchantId,
}: {
  view: AutopsyView;
  merchantId: string;
}): React.ReactElement {
  const { attempt } = view;
  return (
    <Panel>
      <PanelHeader
        eyebrow="Ingested"
        title={<span className="font-mono">{attempt.payment_attempt_id}</span>}
        note={
          <span className="font-mono">
            {merchantId} · order {attempt.order_id} · {formatISTTime(attempt.created_at)} IST
          </span>
        }
        right={
          <span className="num block text-right font-mono text-lg font-semibold text-fg">
            {formatPaise(attempt.amount_paise)}
          </span>
        }
      />
      <PanelBody className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Method" value={attempt.payment_method.toUpperCase()} />
          <Field label="Issuer" value={attempt.issuer} />
          <Field label="Provider" value={attempt.provider} />
          <Field label="Recurring" value={attempt.is_recurring ? "yes" : "no"} />
        </dl>

        <div className="border-t border-line pt-3.5">
          <p className="eyebrow mb-2">Failures recorded ({attempt.failures.length})</p>
          {attempt.failures.length === 0 ? (
            <p className="text-xs text-fg-muted">No failure events on this attempt.</p>
          ) : (
            <ul className="space-y-1.5">
              {attempt.failures.map((failure) => (
                <li
                  key={failure.event_id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-ink-2 px-3 py-2"
                >
                  <span className="state-down state-chip rounded-md px-2 py-0.5 font-mono text-[10px]">
                    {failure.provider_error_code}
                  </span>
                  <Mono value={failure.rail_id} className="text-[11px]" />
                  <span className="num font-mono text-[10px] text-fg-faint">
                    {formatISTTime(failure.event_timestamp)}
                  </span>
                  <Chip title="Taxonomy classification recorded at ingest">
                    {failure.taxonomy_code ?? "unclassified"}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PanelBody>
    </Panel>
  );
}

function DiagnosisPanel({ view }: { view: AutopsyView }): React.ReactElement {
  if (!view.diagnosis) {
    return (
      <Panel>
        <PanelHeader eyebrow="Sense and diagnose" title="Diagnosis" />
        <StateNotice
          phase="missing"
          emptyTitle="No diagnosis"
          emptyBody="The diagnosis engine has not classified this attempt."
        />
      </Panel>
    );
  }

  const diagnosis = view.diagnosis;
  const unknown = diagnosis.taxonomy_code === "UNKNOWN";

  return (
    <Panel>
      <PanelHeader
        eyebrow="Sense and diagnose"
        title="Diagnosis"
        note={diagnosis.root_cause}
        right={<StateChip state={diagnosis.rail_state} />}
      />
      <PanelBody className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Taxonomy" value={diagnosis.taxonomy_code} strong />
          <Field label="Confidence" value={formatPercent(diagnosis.confidence)} />
          <Field label="Rail" value={diagnosis.rail_id} />
          <Field label="Suggested" value={diagnosis.suggested_action} />
        </dl>

        {diagnosis.explainability_tokens.length > 0 ? (
          <div className="border-t border-line pt-3.5">
            <p className="eyebrow mb-2">Why</p>
            <div className="flex flex-wrap gap-1.5">
              {diagnosis.explainability_tokens.map((token) => (
                <Chip key={token}>{token}</Chip>
              ))}
            </div>
          </div>
        ) : null}

        {unknown ? (
          <div className="state-degraded state-tile rounded-xl p-4">
            <p className="state-text font-mono text-[10px] font-semibold uppercase tracking-wider">
              unmapped decline code
            </p>
            <p className="mt-1.5 max-w-2xl text-[11px] leading-relaxed text-fg-muted">
              The deterministic mapper does not recognise this provider code, so it failed closed
              at UNKNOWN rather than guessing. The{" "}
              <Link href="/language" className="text-iris underline underline-offset-2">
                language layer
              </Link>{" "}
              can propose a mapping for human review — it is never applied automatically.
            </p>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

function Field({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): React.ReactElement {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd
        title={value}
        className={`mt-1.5 truncate font-mono text-xs ${strong ? "font-semibold text-fg" : "text-fg-muted"}`}
      >
        {value}
      </dd>
    </div>
  );
}
