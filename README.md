# Salvage

An autonomous system that diagnoses failed payments and recovers the money,
with every decision bounded, explainable, and replayable.

> **Status: Phase 3 of 9 complete.**
> - **Phase 0 (Foundation)**: CI/CD, Testcontainers, Multi-Tenant Database, Observability & Contract Drift Gate.
> - **Phase 1 (Data Engine)**: `salvage-sim` Causal payment stream simulator with counterfactual labels, Markov rail state models, salary cycle dynamics, and zero leakage invariants.
> - **Phase 2 (The Money Core)**: `salvage-core` Cryptographic append-only ledger with continuous verification, multi-tier idempotency store (Redis fast-path + PostgreSQL fallback), per-customer distributed locking, transactional outbox with `SKIP LOCKED`, hard bounds engine (quiet hours, attempt caps, opt-outs, contact budgets, kill switches), and persistent recovery sagas.
> - **Phase 3 (Sense & Diagnose)**: `salvage-brain` Universal failure taxonomy (NPCI/ISO-8583/gateways), real-time sliding-window rail health sensing, point-in-time leak-free feature store, and contextual root cause diagnostic engine with explainability tokens.
> - **Phase 4 (Next)**: Recoverability & Policy Engine (`salvage-brain` + `salvage-core`).

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
- **Phase 1 (`salvage-sim`)**: Causal Payment Failure Simulator modeling 8 NPCI failure modes, Indian salary cycle calendar anchors, and zero-leakage invariant generator (87/87 tests).
- **Phase 2 (`salvage-core`)**: Financial Money Core including tamper-evident cryptographically linked ledger, Redis-backed sliding-window rate limiters and idempotency guards, transactional outbox with guaranteed exactly-once delivery, non-bypassable Bounds Engine (Quiet Hours, Attempt Caps $\le 3$, Opt-Outs, Contact Budgets, Kill Switches), and resilient Saga Coordinator (46/46 tests).
- **Phase 3 (`salvage-brain`)**: Sense & Diagnose Engine with 8 canonical taxonomy mappers (NPCI UPI, ISO-8583 card response codes), sliding-window rail health sensing (1m, 5m, 15m), point-in-time leak-free feature store, and FastAPI endpoints `POST /v1/diagnose` and `GET /v1/sensing/rails`.
- **Phase 4 (`salvage-brain` + `salvage-core`)**: Recoverability Estimation Model, Expected Net Utility Optimizer, `POST /v1/decide`, and `salvage-core` `RecoveryPolicyExecutor` bridging intelligence decisions into bounded distributed-locked saga executions and immutable ledger audits.
- **Phase 5 (`salvage-eval`)**: Off-Policy Evaluation Harness implementing 4 classical estimators (IPS, SNIPS, Direct Method, Doubly Robust), 95% bootstrap confidence intervals, Kish Effective Sample Size diagnostics, calibration curves, and automated regret accounting generated via `make eval` (8/8 tests).
- **Phase 6 (`salvage-mcp`)**: Model Context Protocol Server providing AI assistants with read-only causal decision explainability (`explain_decision`), real-time rail health telemetry (`get_rail_health`), aggregate recovery statistics (`get_recovery_stats`), incident monitoring (`list_open_incidents`), and counterfactual policy simulation (`simulate_policy_change`) (10/10 tests).
- **Phase 7 (`salvage-console`)**: Next.js 15 Operator Interface featuring **The War Room** (money-at-risk ticker, 2D rail health matrix, active blast radius cards, live decision feed), **The Autopsy View** (causal failure dissection, 5-action expected net utility ranking, bounds gate audit, sha256 hash-chain verifier), and **The Policy Sandbox** (natural language hypothesis evaluator with ESS refusal guard) (6/6 tests).

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, components, data flow
- [EVALUATION.md](EVALUATION.md) — empirical off-policy evaluation report generated by `salvage-eval`
- [DECISIONS.md](DECISIONS.md) — index of architecture decision records
- [docs/PHASE_0_SUMMARY.md](docs/PHASE_0_SUMMARY.md) — Phase 0 delivery summary
- [docs/PHASE_1_SUMMARY.md](docs/PHASE_1_SUMMARY.md) — Phase 1 delivery summary
- [docs/PHASE_2_SUMMARY.md](docs/PHASE_2_SUMMARY.md) — Phase 2 delivery summary
- [docs/PHASE_3_SUMMARY.md](docs/PHASE_3_SUMMARY.md) — Phase 3 delivery summary
- [docs/PHASE_4_SUMMARY.md](docs/PHASE_4_SUMMARY.md) — Phase 4 delivery summary
- [docs/PHASE_5_SUMMARY.md](docs/PHASE_5_SUMMARY.md) — Phase 5 delivery summary
- [docs/PHASE_6_SUMMARY.md](docs/PHASE_6_SUMMARY.md) — Phase 6 delivery summary
- [docs/PHASE_7_SUMMARY.md](docs/PHASE_7_SUMMARY.md) — Phase 7 delivery summary
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
