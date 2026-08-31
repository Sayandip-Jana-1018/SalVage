# ADR-0008: Where a Language Model Is Allowed

**Status:** Accepted
**Date:** 2026-08-31
**Decision:** Language models are used where language is the problem. They are structurally prevented from participating in a money decision, and the prevention is enforced by a test on the import graph rather than by convention.

## Context

Principle 4 of this project has been "no LLM makes a money decision" since
before any code was written. Until Phase 11 that was easy to honour, because
nothing in the repository called a model at all.

Phase 11 adds three features that genuinely need one, and the request that
prompted them was for "more LLM, more Gemini power" in the recovery loop
itself. The straightforward reading of that request — a webhook arrives, prompt
a model with "should we retry this?", act on the answer — is what most
submissions in this space do. It demonstrates well for ninety seconds and fails
the first question anyone who has operated a payment system will ask:

- **Replay.** A customer disputes a double charge six weeks later. The decision
  has to be reconstructed exactly. A hosted model cannot be replayed: the
  weights, the tokeniser and the serving stack all change under a stable model
  id, and `temperature=0` reduces variation without removing it.
- **Bounds.** "It must never retry more than three times, never inside quiet
  hours, and never after an opt-out" is a property that has to hold under
  adversarial input. A prompt is not an enforcement mechanism. You cannot bound
  a model's action space by asking it nicely.

Both of those are already solved in this codebase, in code: decisions are
deterministic functions of point-in-time features, and `BoundsEngine` refuses
actions that violate limits it holds independently of whatever proposed them.

## Decision

**A language model may be used where the output is language and the failure
mode is a bad sentence. It may not be used where the output is an action and
the failure mode is money.**

Three uses qualify, all in `services/salvage-brain/src/salvage_brain/language/`:

1. **Unknown decline-code triage.** A code the deterministic mapper cannot
   resolve is described to a model, which *proposes* a taxonomy mapping into a
   human review queue. Never applied; a human edits `mapper.py` or that table
   does not change. A code the mapper already resolves is refused rather than
   re-examined.
2. **Multilingual nudge copy.** The policy engine decides to contact a
   customer; the model writes the sentence in one of five languages. It may not
   write a digit — it produces a template with `{amount}` and `{merchant}`, and
   the service substitutes them, formatting the amount from integer paise.
3. **Incident narration.** A decision chain the deterministic path already
   computed, rendered as English for an operator. Every number in the output
   must already appear in the input.

A fourth belongs to the MCP server, which has existed since Phase 6: an
assistant connected to it can answer operational questions in natural language
through five read-only tools. It needs no credential here — the assistant
brings its own, and Salvage never sees it.

### How the boundary is enforced

- **Import graph.** `tests/test_language_boundary.py` builds the first-party
  import graph and asserts that the transitive closure of `taxonomy`,
  `features`, `sensing`, `diagnosis` and `policy` does not contain
  `salvage_brain.language`. Only the application factory may import it, and
  only to mount routes. This mirrors the no-leakage architecture test in
  `packages/salvage-sim`.
- **Service split.** The effector is in salvage-core, a different process in a
  different language with no client for these routes. There is no call path
  from generated text to `PaymentProvider`.
- **Validators that reject rather than repair.** Every model response passes a
  contract check — a strict schema for triage, a digit and placeholder check
  for copy, a numeric-token subset check for narration. A response that fails
  raises. Nothing is coerced into the expected shape, because a silently
  repaired answer is indistinguishable from a correct one at exactly the moment
  the difference matters.
- **Off by default.** `SALVAGE_LANGUAGE_ENABLED` defaults to false, and a
  present `GEMINI_API_KEY` does not switch it on. This is the only outbound
  third-party call in the repository, and cloning is not consent to it.

### What is deliberately not done

No confidence value is requested from the model in triage. A number attached to
"this code means X" is a claim about the outside world, which ADR-0006 kind
three forbids outright — and it is a number in exactly the shape that gets
pasted into a mapping table. The human who checks the specification sets the
confidence.

## Consequences

- The three features can be switched off entirely and the system loses no
  correctness, only convenience. That is the test of whether the boundary was
  drawn in the right place.
- Every generated artifact records the model id, a SHA-256 of the exact prompt,
  and the time. That is provenance, not replay; it is the honest substitute,
  and its inadequacy for a money decision is the argument for this ADR.
- The adapter in `provider.py` is transcribed from Google's published API and
  has never been executed from this repository. `make gemini-e2e` exists to
  close that gap and the docstring says so, in the same way
  `RazorpayTestProvider` separates the calls a run has verified from the ones
  transcribed from documentation.

## Alternatives considered

**A model in the decision loop, with bounds applied afterwards.** Rejected. The
bounds engine would still hold, so nothing unsafe could execute — but the
decision would no longer replay, and the system's central claim is that every
decision is reconstructible. Trading that for a decision quality nobody has
measured is a bad trade, and the fitted model in Phase 10 is interrogable by
hand, which a prompt never is.

**Auto-applying a high-confidence triage proposal.** Rejected. The mapper is
the one place this code acts on an unverified claim about the outside world
(`docs/OPEN_NUMBERS.md` opens with it). Adding an automatic writer to that
table would let a plausible-sounding generation become behaviour without anyone
reading it.
