# Salvage

An autonomous system that diagnoses failed payments and recovers the money,
with every decision bounded, explainable, and replayable.

> **Status: Phases 0 through 13 are built. The system executes recovery actions.**
>
> `salvage-core` has a `PaymentProvider` port with two adapters. The default
> `SimulatedProvider` needs no credentials and no network, so the quickstart
> works for anyone. `RazorpayTestProvider` makes real calls against Razorpay
> test mode, and `make razorpay-e2e` has been run successfully against it —
> it creates a real, payable test-mode payment link and reads it back.
>
> Every retry passes through a **reconciliation guard** that asks the provider
> what actually happened before charging anyone again. A timed-out call is
> recorded as `UNKNOWN`, never as a failure, because treating "we don't know"
> as "it failed" is how a customer gets charged twice.
>
> **One honest limitation, and it is a property of payments rather than of this
> code:** a gateway cannot re-charge an arbitrary failed one-off payment.
> Collecting again needs the customer to authorise it. So against real Razorpay
> the executable recovery for a one-off failure is a **payment link**, not a
> silent retry — `RazorpayTestProvider.retry()` refuses and says why. Anything
> claiming otherwise is using a saved token, acting under a mandate, or lying.
> See [ADR-0003](docs/adr/0003-payment-provider-abstraction.md).
>
> - **Phase 0 — Foundations**: CI, Testcontainers, multi-tenant schema with append-only triggers, health endpoints, contract drift gate.
> - **Phase 1 — `salvage-sim`**: causal failure simulator with ground-truth counterfactual labels, a two-level continuous-time Markov chain for rail health, salary-cycle balance dynamics, and two enforced no-leakage properties.
> - **Phase 2 — `salvage-core`**: hash-chained append-only ledger with independent verification, multi-tier idempotency, per-customer distributed locking, transactional outbox, bounds engine, recovery sagas.
> - **Phase 3 — `salvage-brain`**: failure taxonomy, sliding-window rail health sensing, point-in-time feature store, diagnosis engine with explainability tokens.
> - **Phase 4 — decide**: expected-net-value optimiser and `RecoveryPolicyExecutor`, which records bounded decisions through sagas into the ledger.
> - **Phase 5 — `salvage-eval`**: off-policy evaluation (Direct Method, IPS, SNIPS, Doubly Robust), bootstrap confidence intervals, Kish ESS, calibration and regret accounting.
> - **Phase 6 — `salvage-mcp`**: read-only MCP tools over the live services. No tool decides or executes anything.
> - **Phase 7 — `salvage-console`**: Next.js 15 operator interface reading the live services through server-side routes. No fixtures.
> - **Phase 8 — hardening**: Grafana dashboards as code, load and latency harness, multi-tenant isolation drill, SRE runbook.
> - **Phase 9 — the effector**: `PaymentProvider` port, deterministic `SimulatedProvider`, `RazorpayTestProvider`, reconciliation guard, append-only provider-operation audit, signed webhook ingest.
> - **Phase 10 — measurement**: recovery model fitted from logged outcomes with a held-out split, shadow mode with a paired bootstrap, and two measurement defects found and fixed.
> - **Phase 11 — the language layer**: Gemini used for unknown decline-code triage, multilingual nudge copy and incident narration — all outside the money path, off by default, and structurally prevented from reaching a decision by a test on the import graph. See [ADR-0008](docs/adr/0008-language-model-boundary.md).
> - **Phase 12 — the console, rebuilt**: dark instrument panel, colour reserved for state, money typeset from integer paise, motion only on state change. The scroll-linked hero animation and its 1.8 MB of unlicensed frames are deleted.
> - **Phase 13 — the security boundary**: every API route in both services now requires a bearer key bound to a tenant. Until this, reading another merchant's ledger was a matter of editing a URL. Plus `docker-compose.prod.yml`, a deployment guide, and [PRODUCT.md](PRODUCT.md) — what this is, who would buy it, and what is honestly not ready. See [ADR-0009](docs/adr/0009-api-authentication.md).

## The problem

When an online payment fails, the merchant sees "payment failed." Underneath
those two words sit genuinely different situations — issuer overload,
insufficient balance, expired card, risk-engine decline, network timeout,
customer abandonment, expired mandate — each needing a different response.
They all arrive labelled identically.

So merchants do one of two things: nothing, or blind retry. Blind retry against
an already-degraded issuer deepens the throttling; retrying an
insufficient-funds decline immediately fails again and costs gateway fees.

## What Salvage will do

For every failed payment it **senses** whether the failure is part of a
systemic pattern, **diagnoses** the cause, **decides** on exactly one bounded
recovery action, **executes** it inside limits it cannot exceed, and
**records** the decision in a tamper-evident ledger that replays identically.

Doing nothing is a first-class action the policy can choose.

## Quick start

You need **Docker** and **bash**. Nothing else — no JDK, no Python, no Node.

```bash
git clone <repo-url> salvage && cd salvage
make demo
```

`make demo` builds both services, starts the stack, publishes a
`payment_failed.v1` event to Kafka, and asserts that the values which come back
out of the Python service are the values that went in — including that
publishing the same event twice still produces one row.

Other targets:

```bash
make up            # infrastructure only (PostgreSQL, Redis, Redpanda)
make down          # stop, keep data
make clean         # stop and delete all data
make preflight     # check your toolchain before running tests
make test          # every test (needs JDK 21 + uv, see below)
make lint          # spotless, ruff, mypy --strict, contract drift gate
make help          # all targets
```

### Running the tests

`make demo` is Docker-only. `make test` additionally needs:

| Tool | Why |
|---|---|
| JDK 21 | salvage-core. Gradle will download one if absent (foojay resolver). |
| [uv](https://docs.astral.sh/uv/) | salvage-brain. Fetches its own Python 3.12. |

`make preflight` checks all of this and tells you what is missing.

### Development environment

Developed and verified on **WSL2 / Ubuntu** with Docker Desktop. `make` is not
present on Windows by default, so run these from a WSL2 shell.

#### Windows setup, once

**1. Enable Docker Desktop's WSL integration.** Settings → Resources → WSL
integration → toggle on your distro → Apply & restart. Without it the Docker
daemon is unreachable from your shell and `make preflight` reports
`MISS daemon`.

**2. Put the repository inside the WSL2 filesystem**, not under `/mnt/c`.

This is not a preference. Gradle's file hasher uses I/O that the 9p driver
serving `/mnt/c` does not support, and the build dies with:

```
java.io.IOException: Input/output error
```

The `Makefile` works around it by relocating Gradle's project cache when it
detects a `/mnt/` path, so a build there will complete — but every file read
still crosses the Windows/Linux boundary, and a Python virtualenv created from
one side is unusable from the other.

Clone fresh rather than copying, so no build output, virtualenv, or Windows
line endings come along:

```bash
wsl                                    # from PowerShell, or open Ubuntu
cd ~
git clone <repo-url> salvage
cd salvage
```

**3. Put the toolchain on your PATH permanently.** Add to `~/.profile` —
**not** `~/.bashrc`:

```bash
export JAVA_HOME="$HOME/.local/share/jdk-21"
export PATH="$JAVA_HOME/bin:$HOME/.local/bin:$PATH"
```

Ubuntu's default `~/.bashrc` opens with

```bash
case $- in
    *i*) ;;
      *) return;;
esac
```

so it returns immediately for a non-interactive shell. Exports placed there
work in your terminal but are invisible to `bash -l`, to scripts, and to
anything a tool spawns — which shows up as `make preflight` reporting `java`
missing even though `java -version` works when you type it. `~/.profile` is
read by every login shell. Keep `~/.bashrc` for interactive-only things like
aliases and the prompt.

If you do not have them yet:

```bash
# JDK 21 (or skip -- Gradle's foojay resolver will fetch one)
mkdir -p ~/.local/share/jdk-21
curl -fsSL "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse" \
  | tar -xz -C ~/.local/share/jdk-21 --strip-components=1

# uv (fetches its own Python 3.12)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Then `source ~/.bashrc && make preflight` — every line should read `ok`.

**4. Point your editor at WSL, not Windows.** In VS Code, install the **WSL**
extension, then run `code .` from the WSL shell. The Java and Python language
servers then run inside Linux against the same JDK 21 and Python 3.12 the build
uses. Running the editor against the Windows filesystem is what produces
"missing package" and "Java 8 vs 21" errors while the build itself is fine.

#### Git authentication inside WSL

GitHub removed password authentication for git operations in 2021, so the
password prompt on an HTTPS clone will always fail with
`Password authentication is not supported for Git operations`.

Reusing the Windows credential manager from WSL only works if Windows interop
is enabled in your distro. Check first:

```bash
ls /proc/sys/fs/binfmt_misc/WSLInterop*
```

If that prints nothing, WSL cannot execute Windows binaries and the bridge is
not available — use SSH:

```bash
ssh-keygen -t ed25519 -C "salvage-wsl" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
# paste into GitHub -> Settings -> SSH and GPG keys -> New SSH key
ssh -T git@github.com          # accept the host key; "successfully authenticated" is expected
git clone git@github.com:<owner>/<repo>.git salvage
```

If interop *is* registered, this also works and reuses your Windows login:

```bash
git config --global credential.helper \
  "/mnt/c/Program\\ Files/Git/mingw64/bin/git-credential-manager.exe"
```

## Project structure

```
salvage/
  services/
    salvage-core/      Java 21     transactional money service
    salvage-brain/     Python 3.12 ML decision service
    salvage-mcp/       TypeScript  MCP server              (Phase 6)
  packages/
    salvage-sim/       Python      failure simulator        (Phase 1)
    salvage-eval/      Python      evaluation harness       (Phase 5)
  apps/
    salvage-console/   Next.js     operator interface       (Phase 7)
  contracts/
    events/            JSON Schema  event definitions
    openapi/           OpenAPI 3.1  API contracts
  docs/adr/            architecture decision records
  ops/                 database init, Kafka topics, dashboards
  scripts/             demo, contract checks
```

## What works today

- **Phase 0 (Foundations & Stack)**: PostgreSQL 16 + TimescaleDB, Redis 7, Redpanda, health endpoints with dependency round-tripping, contract drift gate (`scripts/check_contracts.py`).
- **Phase 1 (`salvage-sim`)**: causal failure simulator. Seven failure causes with four distinct correct responses, a two-level Markov chain producing bursty correlated outages, salary-cycle balance dynamics, mandate lifecycle, and ground-truth counterfactuals. Issuers are synthetic by design (ADR-0006). No-leakage is enforced by an import-graph test and a nuisance-perturbation test (87 tests).
- **Phase 2 (`salvage-core`)**: Financial Money Core including tamper-evident cryptographically linked ledger, Redis-backed sliding-window rate limiters and idempotency guards, transactional outbox with guaranteed exactly-once delivery, non-bypassable Bounds Engine (Quiet Hours, Attempt Caps $\le 3$, Opt-Outs, Contact Budgets, Kill Switches), and resilient Saga Coordinator, plus a tenant-scoped read API for telemetry and ledger verification (59 tests).
- **Phase 3 (`salvage-brain`)**: Sense & Diagnose Engine with 8 canonical taxonomy mappers (NPCI UPI, ISO-8583 card response codes), sliding-window rail health sensing (1m, 5m, 15m), point-in-time leak-free feature store, and FastAPI endpoints `POST /v1/diagnose` and `GET /v1/sensing/rails`.
- **Phase 4 (`salvage-brain` + `salvage-core`)**: Recoverability Estimation Model, Expected Net Utility Optimizer, `POST /v1/decide`, and `salvage-core` `RecoveryPolicyExecutor` bridging intelligence decisions into bounded distributed-locked saga executions and immutable ledger audits.
- **Phase 5 (`salvage-eval`)**: Off-Policy Evaluation Harness implementing 4 classical estimators (IPS, SNIPS, Direct Method, Doubly Robust), 95% bootstrap confidence intervals, Kish Effective Sample Size diagnostics, calibration curves, and automated regret accounting generated via `make eval` (8/8 tests).
- **Phase 6 (`salvage-mcp`)**: Model Context Protocol server exposing five read-only tools over the live services: `explain_decision`, `get_rail_health`, `get_recovery_stats`, `list_open_incidents`, `verify_ledger`. Every tool reads; none decides or executes, and neither backend exposes a route that would let one. Errors surface as tool errors rather than as plausible answers (22 tests).
- **Phase 7 (`salvage-console`)**: Next.js 15 operator interface, reading the live services through six server-side route handlers. **War Room** (live rail sensing matrix, open incidents, ledger stream with chain verification), **Autopsy** (one attempt: ingest, diagnosis, action valuations, ledger entries), **Checkout** (publishes a real `payment_failed.v1` event and follows it through the actual pipeline), **Evaluation** (the measured off-policy results from `make eval`). Loading, empty and unreachable are distinct states everywhere -- an empty matrix and a lost backend never look the same.
- **Phase 10 (Fitted model & shadow mode)**: `FittedRecoverabilityModel` estimates P(recovery | context, action) by hierarchical shrinkage, fitted on a training split and scored on held-out episodes; it may only see what a production log contains, and two tests pin it away from the counterfactual answer key. **Shadow mode** compares a challenger against the champion with a *paired* bootstrap — one resample, both policies scored on it — which is the statistically correct test and materially more powerful than comparing two intervals for overlap. Against the strongest baseline the policy returns **+9,682.5 paise per failure, 95% CI [+5,707.9, +14,043.2]**, excluding zero; the unpaired overlap test on the same data calls that indistinguishable, and the report prints both (34 tests).
- **Phase 9 (The effector)**: `PaymentProvider` port with `SimulatedProvider` (deterministic, credential-free, models the timeout-that-actually-captured case) and `RazorpayTestProvider` (verified against the live test API). `ReconciliationGuard` refuses every retry that is not backed by positive evidence no money moved — only `FAILED` and `NOT_FOUND` qualify; `UNKNOWN` blocks. Idempotency keys are derived, never generated, so a redelivery cannot charge twice. `provider_operations` records intent before the call and settles once, so a crash mid-payment leaves a discoverable row rather than nothing. Signed webhook ingest with constant-time HMAC-SHA256 verification (104 tests).
- **Phase 8 (Hardening & Production Operations)**: declarative Grafana dashboards as code (`ops/grafana/`), a load and latency harness (`scripts/stress_test.py`) measuring schema validation in-process and the real `POST /v1/decide` endpoint over HTTP, a multi-tenant isolation drill running under Testcontainers (`MultiTenantIsolationTest`), and an SRE runbook (`docs/PRODUCTION_RUNBOOK.md`). **No performance figures are quoted**, here or in `docs/OPEN_NUMBERS.md` — the ones that used to be were measuring an `asyncio.sleep`, not this system. See [docs/PHASE_8_SUMMARY.md](docs/PHASE_8_SUMMARY.md).
- **Phase 11 (The language layer)**: `salvage_brain.language` — three uses of Gemini where the problem is genuinely language, and none where it is money. **Triage**: a decline code the deterministic mapper cannot resolve is described to a model, which *proposes* a taxonomy mapping into a human review queue; it is never applied, no confidence value is asked for, and a code that already maps is refused rather than re-examined. **Nudge copy**: the policy engine decides to contact a customer, the model writes the sentence in one of five Indian languages, and it may not write a digit — it returns a template with `{amount}` and `{merchant}` and this service substitutes them from integer paise. **Narration**: a decision chain turned into English for an operator, where every number in the output must already appear in the input. Off by default (`SALVAGE_LANGUAGE_ENABLED`), and a present key does not switch it on. The boundary is enforced by `test_language_boundary.py`, which reads the import graph and fails if the decision path can reach the language layer at all (75 tests; 131 unit, 144 with integration).
- **Phase 12 (The console, rebuilt)**: dark, dense instrument panel — a fixed rail and top bar rather than a centred landing-page stack. **Colour means state**: emerald healthy, amber degraded, rose down, slate not-observed, and one accent (iris) deliberately outside that palette. **Money is typeset from integer paise** with tabular numerals; nothing divides by 100 into a float. **Motion marks state change** and stops under `prefers-reduced-motion`. `ScrollFrameSequence.tsx` and `public/rabit/` — 409 lines and 1.8 MB of frames with no recorded provenance — are deleted, which closes the unlicensed-asset problem outright. The autopsy page now lists attempts through `GET /v1/attempts/{merchant_id}` instead of demanding an id, and a new `/language` screen carries the Phase 11 tools and the argument for where their edges are (12 tests).
- **Phase 13 (The security boundary)**: every route in salvage-core and salvage-brain requires `Authorization: Bearer <key>`, and a key carries a scope. A **merchant** key is bound to one tenant and reaching for another is answered **404, not 403** — a 403 confirms the other tenant exists. An **operator** key may address every tenant and is what the console runs as. Configuration holds SHA-256 hashes, never keys (`scripts/generate_api_key.sh`), and both services **refuse to start** with authentication required and no keys configured. A test walks the mounted application and fails the build on any route that is not behind the authenticator, with an allowlist of exactly the two health probes; the signed webhook endpoint is exempt because a gateway holds no Salvage key and authenticates an HMAC signature instead. Shipped alongside: `docker-compose.prod.yml` (no secret has a default, nothing binds to 0.0.0.0), a console Dockerfile, [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), and [PRODUCT.md](PRODUCT.md) (45 tests).

## Documentation

- **[PRODUCT.md](PRODUCT.md) — start here if you want to know what this is worth.**
  What it does in plain language, how it works, who would buy it, what you
  hand them, and what is honestly not ready.
- **[HANDOFF.md](HANDOFF.md) — start here if you are picking this project up.**
  What is built, what is not, the conventions that are not negotiable, the
  traps that have already cost time, and the work queue.
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, components, data flow
- [EVALUATION.md](EVALUATION.md) — empirical off-policy evaluation report generated by `salvage-eval`
- [DECISIONS.md](DECISIONS.md) — index of architecture decision records
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — putting it on a real host: secrets, keys, TLS, backups
- [docs/PRODUCTION_RUNBOOK.md](docs/PRODUCTION_RUNBOOK.md) — SRE & operational triage runbook
- [docs/PHASE_0_SUMMARY.md](docs/PHASE_0_SUMMARY.md) — Phase 0 delivery summary
- [docs/PHASE_1_SUMMARY.md](docs/PHASE_1_SUMMARY.md) — Phase 1 delivery summary
- [docs/PHASE_2_SUMMARY.md](docs/PHASE_2_SUMMARY.md) — Phase 2 delivery summary
- [docs/PHASE_3_SUMMARY.md](docs/PHASE_3_SUMMARY.md) — Phase 3 delivery summary
- [docs/PHASE_4_SUMMARY.md](docs/PHASE_4_SUMMARY.md) — Phase 4 delivery summary
- [docs/PHASE_5_SUMMARY.md](docs/PHASE_5_SUMMARY.md) — Phase 5 delivery summary
- [docs/PHASE_6_SUMMARY.md](docs/PHASE_6_SUMMARY.md) — Phase 6 delivery summary
- [docs/PHASE_7_SUMMARY.md](docs/PHASE_7_SUMMARY.md) — Phase 7 delivery summary
- [docs/PHASE_8_SUMMARY.md](docs/PHASE_8_SUMMARY.md) — Phase 8 delivery summary
- [docs/OPEN_NUMBERS.md](docs/OPEN_NUMBERS.md) — where real-world figures are needed

## Engineering principles

1. **Never originate a duplicate charge**, and never retry an attempt whose
   outcome is unknown
2. **Every decision replayable** — bit-identical from the same inputs
3. **Bounds enforced in code**, not in configuration comments
4. **No LLM makes a money decision** — ever
5. **Honest measurement** — named baseline, confidence interval, stated limits
6. **Point-in-time correctness** — no future information in any feature
7. **Fail closed** — uncertainty means no action

## Licence

Proprietary. All rights reserved.

TimescaleDB is used under the [Timescale License](https://www.timescale.com/legal/licenses),
which is not OSI-approved open source — see
[ADR-0005](docs/adr/0005-timescaledb-licensing.md).
