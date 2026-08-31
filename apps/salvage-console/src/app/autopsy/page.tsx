"use client";

import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { StaleBanner, StateNotice } from "@/components/StateNotice";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { Chip, DataTable, Mono, Td, Th } from "@/components/ui/Primitives";
import { formatAge, formatCount, formatPaise } from "@/lib/formatters";
import { useMerchant } from "@/lib/merchant";
import { useApi } from "@/lib/useApi";
import type { AttemptPage } from "@/types";

const POLL_MS = 15000;
const LIMIT = 50;

/**
 * Pick an attempt, or look one up by id.
 *
 * This page used to be a lookup and nothing else — a form asking for an id —
 * because no endpoint listed attempts and the honest response to a missing
 * endpoint is to say so rather than to invent a table. salvage-brain now serves
 * `GET /v1/attempts/{merchant_id}`, tenant-scoped and bounded, so the listing
 * is real and the form stays for when somebody arrives with an id in hand.
 */
export default function AutopsyIndexPage(): React.ReactElement {
  const router = useRouter();
  const { merchantId, setMerchantId, ready } = useMerchant();
  const [attemptId, setAttemptId] = useState("");

  const { phase, data, error } = useApi<AttemptPage>(
    ready ? `/api/attempts/${encodeURIComponent(merchantId)}?limit=${LIMIT}` : null,
    POLL_MS,
  );

  const open = (id: string) =>
    router.push(`/autopsy/${encodeURIComponent(id)}?merchant=${encodeURIComponent(merchantId)}`);

  return (
    <div className="enter space-y-4">
      <Panel>
        <PanelHeader
          eyebrow="Per attempt"
          title="Decision autopsy"
          note="Reconstruct one payment attempt end to end: what was ingested, how it was classified, what the policy engine valued, and what the ledger recorded."
        />
        <PanelBody>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = attemptId.trim();
              if (trimmed) open(trimmed);
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <label className="block sm:w-56">
              <span className="eyebrow">Merchant id</span>
              <input
                value={merchantId}
                onChange={(event) => setMerchantId(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-line-strong bg-ink-2 px-3 py-2 font-mono text-xs text-fg outline-none transition-colors focus:border-iris/60"
              />
            </label>

            <label className="block flex-1">
              <span className="eyebrow">Payment attempt id</span>
              <span className="relative mt-1.5 block">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" />
                <input
                  value={attemptId}
                  onChange={(event) => setAttemptId(event.target.value)}
                  placeholder="pay_…"
                  className="w-full rounded-lg border border-line-strong bg-ink-2 py-2 pl-9 pr-3 font-mono text-xs text-fg placeholder:text-fg-faint/70 outline-none transition-colors focus:border-iris/60"
                />
              </span>
            </label>

            <button
              type="submit"
              disabled={!attemptId.trim()}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-iris/40 bg-iris/10 px-4 py-2 font-mono text-xs font-semibold text-iris transition-colors hover:bg-iris/15 disabled:opacity-40"
            >
              Open
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </form>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          eyebrow={`Newest first · up to ${LIMIT}`}
          title="Recent attempts"
          note={
            <>
              Served by <span className="font-mono text-fg-muted">GET /v1/attempts/{"{merchant_id}"}</span>,
              scoped to this tenant. There is no cross-tenant listing, because reading across
              tenants is not a query these services can express.
            </>
          }
          right={
            data ? (
              <span className="num font-mono text-[11px] text-fg-muted">
                {formatCount(data.attempts.length)} shown
              </span>
            ) : null
          }
        />

        {phase !== "ready" && !data ? (
          <StateNotice
            phase={phase}
            error={error}
            emptyTitle="No attempts ingested"
            emptyBody="Nothing has been ingested for this merchant. Run `make demo`, or publish one from the checkout page."
          />
        ) : data && data.attempts.length === 0 ? (
          <StateNotice
            phase="missing"
            emptyTitle="No attempts for this merchant"
            emptyBody="salvage-brain answered with an empty list. Either nothing has been ingested, or the merchant id above is not the one carrying traffic."
          />
        ) : (
          <PanelBody className="!px-2 !py-1">
            {phase === "unavailable" && error ? (
              <div className="px-3 pt-3">
                <StaleBanner error={error} />
              </div>
            ) : null}

            <DataTable
              head={
                <>
                  <Th>Attempt</Th>
                  <Th align="right">Amount</Th>
                  <Th>Rail</Th>
                  <Th align="right">Failures</Th>
                  <Th align="right">Ingested</Th>
                  <Th>{""}</Th>
                </>
              }
            >
              {data?.attempts.map((attempt) => (
                <tr
                  key={attempt.payment_attempt_id}
                  className="cursor-pointer transition-colors hover:bg-ink-2/70"
                  onClick={() => open(attempt.payment_attempt_id)}
                >
                  <Td>
                    <Mono value={attempt.payment_attempt_id} chars={26} className="text-fg" />
                    <span className="mt-0.5 block font-mono text-[10px] text-fg-faint">
                      {attempt.order_id}
                    </span>
                  </Td>
                  <Td align="right" className="num font-mono text-fg">
                    {formatPaise(attempt.amount_paise)}
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1">
                      <Chip>{attempt.issuer}</Chip>
                      <Chip>{attempt.payment_method.toUpperCase()}</Chip>
                    </span>
                  </Td>
                  <Td
                    align="right"
                    className={`num font-mono ${attempt.failure_count > 0 ? "text-down" : "text-fg-faint"}`}
                  >
                    {formatCount(attempt.failure_count)}
                  </Td>
                  <Td align="right" className="num font-mono text-fg-faint">
                    {formatAge(attempt.created_at)}
                  </Td>
                  <Td align="right">
                    <Link
                      href={`/autopsy/${encodeURIComponent(attempt.payment_attempt_id)}?merchant=${encodeURIComponent(merchantId)}`}
                      className="text-iris"
                      aria-label={`Open autopsy for ${attempt.payment_attempt_id}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Td>
                </tr>
              ))}
            </DataTable>
          </PanelBody>
        )}
      </Panel>
    </div>
  );
}
