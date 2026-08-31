# Salvage, as a product

**Read this if you have no context on the codebase and need to know what it is,
what it is worth, and what you could actually sell.**

Everything below is written to be checkable. Where a claim rests on something
that has not been measured against real traffic, it says so, because the fastest
way to lose a payments buyer is to quote them a number they can tell you made
up.

---

## 1. What it is, in one paragraph

When an online payment fails, the merchant's dashboard says **"payment
failed."** Underneath those two words sit half a dozen completely different
situations that need opposite responses. Salvage reads each failed payment,
works out which situation it is, chooses exactly one recovery action, checks
that action against hard limits it cannot exceed, carries it out, and writes a
tamper-evident record of why. It is a decision engine for failed payments, with
an audit trail.

---

## 2. The problem, concretely

A customer taps "Pay ₹1,200 via UPI." It fails. Here is what might have
happened, and what the right response is:

| What actually happened | Right response | What a blind retry does |
|---|---|---|
| The bank's servers are overloaded | Wait, or route to a different rail | Deepens the throttling |
| Customer has ₹400, order is ₹1,200 | Retry after payday | Fails again, costs a fee each time |
| Card expired | **Switch to another method** — the card is dead, the customer is not | Never works on that card |
| Risk engine declined | Stop | Starts to look like an attack |
| Network timed out | **Check first** — it may have succeeded | Can double-charge a real customer |

They all arrive labelled identically. So merchants do one of two things: nothing
(lose the sale), or blind-retry (make it worse). **Doing nothing is a
first-class action Salvage is allowed to choose** — that is not a limitation,
it is the point. A recovery system that always acts is a system that will
eventually charge somebody twice.

---

## 3. How it works

Five stages. A failed payment enters at the top and either an action comes out
of the bottom or a recorded decision not to act does.

```
  merchant's payment stack
           │  publishes payment_failed.v1 (a JSON event, schema-enforced)
           ▼
  ┌──────────────────┐
  │  1. INGEST       │  salvage-core (Java)
  │                  │  validates against the schema, writes the attempt,
  │                  │  appends to the hash-chained ledger
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │  2. SENSE        │  salvage-brain (Python)
  │                  │  is this failure part of a pattern? sliding-window
  │                  │  health per rail (issuer × method) over 1m / 5m / 15m
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │  3. DIAGNOSE     │  maps the provider's error code into one of eight
  │                  │  causes, with a confidence and explainability tokens
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │  4. DECIDE       │  expected net value per action:
  │                  │    net = P(recovery) × amount − cost
  │                  │  five candidates, highest wins, NO_ACTION included
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │  5. BOUND        │  salvage-core. Quiet hours, attempt cap ≤ 3, opt-outs,
  │                  │  contact budgets, kill switch. Enforced in code.
  │                  │  A refusal here is recorded, with which guard refused.
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │  6. EXECUTE      │  the PaymentProvider port — the only place this system
  │                  │  touches money. Every retry passes a reconciliation
  │                  │  guard first.
  └────────┬─────────┘
           ▼
     hash-chained ledger  (every step above, appended in the same transaction)
```

### The three design decisions that matter

**1. Money decisions are deterministic, and replay identically.**
Given the same inputs, the same decision comes out, bit for bit, forever. That
is not a nice-to-have. Six weeks after a disputed double charge, somebody has to
reconstruct exactly why the system did what it did, and "the model felt like it"
is not an answer that survives a chargeback dispute or a regulator.

**2. No language model makes a money decision — and that is enforced, not
promised.** Salvage uses Gemini in three places where the problem genuinely
*is* language: proposing a mapping for a decline code nothing recognises,
writing customer messages in five Indian languages, and narrating a decision for
an on-call engineer. A test reads the import graph and **fails the build** if
the diagnosis, policy or taxonomy code can reach the language layer at all. In
the nudge path the model is forbidden from writing a digit — it produces a
sentence with `{amount}` in it and the service substitutes the number from
integer paise. See [ADR-0008](docs/adr/0008-language-model-boundary.md).

**3. "We don't know" is a state, and it blocks.**
When a payment call times out, the outcome is `UNKNOWN`, never `FAILED`.
`NOT_FOUND` (the provider says no payment exists) permits a retry, because that
is positive evidence no money moved. `UNKNOWN` refuses one. Treating "we could
not determine the state" as permission to charge someone is exactly how a
customer gets billed twice.

---

## 4. What is actually built

| Piece | What it does | Tests |
|---|---|---|
| `packages/salvage-sim` | Causal failure simulator producing ground-truth counterfactuals — what *would* have happened under the action not taken | 87 |
| `services/salvage-core` | Java 21. Ledger, idempotency, locking, outbox, bounds engine, sagas, payment provider, auth | 127 |
| `services/salvage-brain` | Python 3.12. Sensing, taxonomy, feature store, diagnosis, policy, language layer, auth | 173 |
| `packages/salvage-eval` | Off-policy evaluation: IPS, SNIPS, Direct Method, Doubly Robust, bootstrap CIs | 34 |
| `services/salvage-mcp` | Five read-only MCP tools, so any AI assistant can answer operational questions | 22 |
| `apps/salvage-console` | Next.js operator interface | 22 |

**465 tests**, every count above taken from a run rather than remembered. More usefully: the things they pin are the things that would
otherwise quietly break — that a merchant key cannot read another tenant, that
the label generator cannot import the feature generator, that a fitted model
never sees the counterfactual answer key, that generated customer copy cannot
contain a digit.

---

## 5. What the measurements say, and what they do not

From `EVALUATION.md`, regenerated by `make eval`:

| Policy | Recovery rate | Value per failure |
|---|---|---|
| Never Retry (natural recovery) | 12.4% | 31,402 paise |
| Blind Immediate Retry | 28.3% | 83,949 paise |
| Fixed Schedule Retry | 43.1% | 103,885 paise |
| **Constrained Bandit (Salvage)** | **46.3%** | **113,567 paise** |

Against the strongest baseline: **+9,682.5 paise per failure, 95% CI
[+5,707.9, +14,043.2]**, a paired bootstrap, excluding zero.

**Now the part you must say out loud in every sales conversation.** These are
**simulated** episodes from `packages/salvage-sim`. **Nothing in this system has
ever run against real payment traffic.** The number that is genuinely defensible
is not the recovery rate — it is that the *evaluation methodology* recovers a
known answer on data where the truth is known. That is a claim about the
measuring instrument, not about the outcome, and it is the honest one.

Anyone senior in payments will ask "on whose data?" within ninety seconds. The
answer is "nobody's yet, and that is what the pilot is for." Say it before they
ask.

---

## 6. Running it

| You want to | Do this |
|---|---|
| See it work end to end, locally | `make up && make demo`, then `make eval` |
| Look at the console | `cd apps/salvage-console && npm run dev` |
| Run every test | `make test` |
| Deploy it | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
| Be on call for it | [`docs/PRODUCTION_RUNBOOK.md`](docs/PRODUCTION_RUNBOOK.md) |
| Understand a decision | The console's Autopsy page, or the `explain_decision` MCP tool |

Operating it day to day is three things: watch the war room for unhealthy rails,
open an Autopsy when a specific payment is questioned, and check that the ledger
chain still verifies. The kill switch is a Redis key, documented in the runbook.

---

## 7. Selling it

### There is no "deployed link" to sell

Salvage is not a website. It is server software that sits next to a merchant's
payment stack and needs their failed-payment events. What a customer gets is a
deployment — either on their infrastructure or on one you run for them — plus
API keys and the console. So the answer to "do I give them a link or software?"
is: **software, deployed, with a console URL that only they and you can reach.**

For a *demo*, a hosted instance with simulated traffic is fine and is what you
should build first. It is not the product; it is the thing you screen-share.

### Who actually buys this

Ranked by how likely they are to say yes, not by contract size.

**1. Payment gateways and PSPs — Razorpay, Cashfree, PayU, Juspay.**
They already hold the failure data, the merchant relationships, and the
retry logic that Salvage is a better version of. For them this is a feature,
not a purchase — which means the realistic outcomes are an acqui-hire, a
job, or a partnership, not a licence. **This is also the most likely outcome
of a hackathon submission, and it is a good one.** What you are selling is
the engineering judgement in the repository, and the commit history is the
pitch.

**2. Recurring billing and subscription platforms — Chargebee, Zoho Billing,
Razorpay Subscriptions.**
Failed recurring payments are a named, funded category: *involuntary churn*
and *dunning*. Salvage's mandate-invalid handling, payday-aware retry
scheduling and multilingual nudges are precisely dunning, done more
carefully than most. These companies buy or build this.

**3. Lending, EMI and insurance collections.**
Mandate-based recurring debits, high failure rates, and a genuine
regulatory appetite for auditability. The hash-chained ledger is worth more
here than anywhere else, because "prove what you did and why" is the
recurring question.

**4. Large D2C merchants with heavy UPI volume.**
The direct SaaS motion. Hardest of the four: they will want evidence on
their own data before they will pay, which is why the pilot below exists.

### What you hand over

| Item | What it is |
|---|---|
| **The deployment** | `docker-compose.prod.yml` on one host, or in their cloud. `docs/DEPLOYMENT.md` is the runbook for standing it up. |
| **API keys** | One `merchant` key per tenant, generated by `scripts/generate_api_key.sh`. Handed over in a password manager, never email. |
| **The integration** | They publish `payment_failed.v1` events. The schema in `contracts/events/` is the contract, enforced at both ends. Budget a week of their engineer's time. |
| **The console** | Behind *their* SSO. It holds an operator key, so it must not face the internet. |
| **The evidence** | `EVALUATION.md`, and after the pilot, the same report on their data. |
| **The escape hatch** | It is their PostgreSQL and their ledger. Say that early; it removes the lock-in objection before it is raised. |

### The only honest first sale: a paid shadow-mode pilot

Do **not** try to sell a finished product. Sell a four-to-six week paid pilot,
priced like a consulting engagement (₹3–8 lakh is a defensible band for a
mid-size merchant; the number that matters is that it is not free — free pilots
do not get anyone's engineering time).

In shadow mode Salvage ingests their real failures, diagnoses, decides, and
records what it *would* have done — and executes nothing. Zero money at risk,
zero customer contact, full audit trail. `SALVAGE_PAYMENT_PROVIDER=simulated` is
that mode and it already works. At the end you have a report comparing its
decisions against what they actually did, on their data, and either you have a
real number or you have learned it does not work on real traffic. Both are worth
the fee.

**Then** price the production deployment on recovered value — a percentage of
incremental recovery, measured against the shadow baseline you just
established. That is the pricing model this system is uniquely able to justify,
because it can prove the counterfactual. Do not price per seat and do not price
per transaction; both throw away the one thing you can demonstrate.

---

## 8. What is honestly not ready

If you sell tomorrow, these are what the buyer's engineering and security teams
will find. Better that you find them first.

### Blocking a production sale

1. **It has never seen real payment traffic.** Every number is simulated. This
   is what the pilot fixes and it cannot be fixed any other way.
2. **The decline-code mappings are unverified.** `taxonomy/mapper.py` asserts
   what NPCI UPI and ISO-8583 codes mean, written from memory, with at least
   one known internal contradiction. It is the only place the code acts on an
   unchecked claim about the outside world, it is marked as such in the file and
   in `docs/OPEN_NUMBERS.md`, and somebody has to sit down with the
   specifications. **Two days of work. Do it before any customer conversation.**
3. **The reconciliation sweep is not built.** Payments left in `UNKNOWN` are
   money whose fate the system does not know, and nothing runs periodically to
   resolve them. The database index and repository method are ready; the job is
   not written. **This is the highest-value remaining engineering.**
4. **No compliance posture.** No PCI DSS scoping (Salvage stores no card data,
   which helps enormously, but nobody has documented that), no DPDP Act review,
   no data processing agreement, no penetration test, no SOC 2. A regulated
   buyer's security questionnaire will stop the deal cold.
5. **No company, contract, SLA, or support commitment.** Nobody buys
   infrastructure from a GitHub repository.

### Real, but survivable in a pilot

- API keys have no expiry and no revocation list; revoking means editing
  configuration and restarting.
- No audit log of API *reads* — writes are in the ledger, reads are not
  recorded.
- Single host, single database. A host failure is an outage.
- The Gemini adapter has never been run against Google from this repository.
  `make gemini-e2e` closes that in one command; the language layer is off by
  default until it does.
- No rate limiting at the edge.

---

## 9. What to do in the next ninety days

**Days 1–14 — make the claims defensible.**
Verify the taxonomy mappings against the NPCI and ISO-8583 specifications.
Build the reconciliation sweep. Run `make gemini-e2e`. Rotate the Gemini key
that leaked into a transcript. Stand up a demo instance with simulated traffic
and a console URL you can screen-share.

**Days 15–45 — find one design partner.**
One merchant or one PSP. Not five. The pitch is the pilot in section 7, and
the material is this file plus a fifteen-minute console walkthrough ending on
the Autopsy page — the screen where the system explains a decision it made is
the one that closes people, because nothing else in this category can do it.

**Days 46–90 — run the shadow pilot and report.**
Their events, your decisions, no execution. Produce `EVALUATION.md` on their
data. That report is either the thing you sell on for the next two years, or
it is the evidence that this needs to change direction. Both beat guessing.

**In parallel, the whole time:** send this repository to payments engineering
teams. The commit history is an unusually strong hiring artefact — it contains a
sequence where fabricated data was found, deleted, and documented, and where two
measurement defects were caught by the system's own diagnostics. Very few
candidates can show that. If the fastest route to value turns out to be a job
rather than a company, that is not a failure of the project; it is the project
paying off.

---

## 10. What to read next

| File | Why |
|---|---|
| [HANDOFF.md](HANDOFF.md) | The engineering brief. Everything not recoverable from the code. |
| [README.md](README.md) | Status, quickstart, phase list |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Putting it somewhere real |
| [docs/adr/0006-numbers-policy.md](docs/adr/0006-numbers-policy.md) | Why no number here is invented. The most important file in the repository. |
| [docs/adr/0008-language-model-boundary.md](docs/adr/0008-language-model-boundary.md) | Where an LLM is allowed, and why not further |
| [EVALUATION.md](EVALUATION.md) | The measured results, including the unflattering ones |
| [docs/OPEN_NUMBERS.md](docs/OPEN_NUMBERS.md) | Every place a real-world figure is still missing |
