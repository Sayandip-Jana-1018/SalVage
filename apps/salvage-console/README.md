# salvage-console

**Not built yet. This is a Phase 7 deliverable.** Next.js 15, TypeScript strict.

Narrowed from five surfaces to three, deliberately, to spend the time on
depth in Phases 1–5 instead:

1. **The war room** — a live grid of issuers against payment methods, each cell
   coloured by current health. Active incidents as cards with blast radius. A
   money-at-risk counter at the top. A compact decision feed is folded in here
   rather than being its own surface.
2. **The autopsy** — one failure fully dissected: raw error code, normalised
   cause, counterfactual estimate, chosen action, and the rejected alternatives
   with their scores. Links out to live hash-chain verification.
3. **The policy sandbox** — the merchant types a question in plain English
   ("what if we never retry after nine at night"), it is parsed into a policy
   modification, run through the off-policy evaluator against historical data,
   and returned as a before/after comparison with confidence intervals.

## The sandbox must be willing to say "I don't know"

A merchant's question routinely produces a target policy with near-zero overlap
against the logged data. When effective sample size is too low, the sandbox
**refuses to return a number** and shows the diagnostic instead. Building the
version that always returns a confident answer would be the worst possible
outcome: it would look more impressive and be worthless.

## Design direction

Dense, calm, dark, information-rich — the visual language of Stripe's
dashboard, Linear, and Mercury. One accent colour. Red, amber, and green
reserved strictly for status semantics, never decoration. Numbers in a
monospace face with tabular figures so digits align in columns. Interface text
in Inter or Geist. Hairline borders, very restrained shadow. Motion limited to
numbers ticking and rows appearing.

Information density is a feature. An operator watching this during an outage
needs to see everything at once.
