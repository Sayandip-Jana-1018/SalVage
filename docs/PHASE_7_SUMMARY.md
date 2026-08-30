# Phase 7 Summary: Operator Console (`salvage-console`)

## 1. Overview

Phase 7 delivers `apps/salvage-console`, a Next.js 15 / React 19 / TypeScript
operator interface with three surfaces: the War Room, the Autopsy view, and
the Policy Sandbox.

This document was rewritten after an audit. The version it replaces described
a console built on `src/lib/mockData.ts` — 298 lines of fabricated data — and
quoted that fixture's contents as though they were features. Every figure it
cited (`₹3,42,850` at risk, `₹18,10,000` recovered, a `53.0%` recovery rate, a
`96%` confidence diagnosis corroborated across `34 merchants`, and a health
matrix of four named real banks) came from that file. The file is deleted and
the console now reads the live services through server-side routes.

---

## 2. Surfaces built

### 1. The War Room (`/war-room`, `/`)

- **Rail health matrix** — one row per rail the sensing service has actually
  observed, with its sliding-window success rate and health verdict. Rails
  with no traffic are absent. An empty matrix renders as "no rails observed
  yet" and says explicitly that this is an absence of data and **not** an
  all-clear.
- **Live decision stream** — decisions as `salvage-core` recorded them, with
  the chosen action and the bounds verdict.
- **Hash-chain verifier** — calls the real `/api/v1/ledger/.../verify`
  endpoint, which recomputes the chain server-side. It previously displayed
  "verified" after a 600 ms `setTimeout` without contacting anything.

### 2. The Autopsy view (`/autopsy`, `/autopsy/[attemptId]`)

Reconstructs one attempt: what was ingested, how it was classified, what the
optimiser valued each candidate action at, and what the ledger recorded.

The index is a lookup by id rather than a browse, because until now no
endpoint listed attempts. `GET /v1/attempts/{merchant_id}` now exists —
bounded and tenant-scoped — so a listing is possible; wiring it into this page
is outstanding.

### 3. The Policy Sandbox (`/sandbox`)

Evaluates a policy hypothesis against off-policy replay data and reports the
estimate with its bootstrap confidence interval, **and refuses to answer when
the hypothesis has no support in the logged data**, showing the Kish effective
sample size instead of a number. That refusal is the point of the surface.

---

## 3. State handling

Four explicit phases — `loading`, `ready`, `missing`, `unavailable` — carried by
`src/lib/useApi.ts`, with a generation guard against out-of-order responses.
`StateNotice` renders `missing` and `unavailable` differently, because "this
does not exist" and "we cannot reach the service that would know" are
different facts, and collapsing them is how an outage reads as an all-clear.

---

## 4. Verification

Test counts are deliberately not transcribed here; they were stale within days
last time.

```bash
cd apps/salvage-console && npm test && npm run build
```

---

## 5. Known gaps

- The console has never been visually verified in a browser against a live
  stack.
- `public/rabit/*.jpg` (1.8 MB driving the hero animation) has no recorded
  provenance. See `apps/salvage-console/public/rabit/PROVENANCE.md`.
- A design overhaul is outstanding.
