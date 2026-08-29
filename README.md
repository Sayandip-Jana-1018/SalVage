# Salvage

An autonomous system that diagnoses failed payments and recovers the money,
with every decision bounded, explainable, and replayable.

> **Status: Phase 0 of 9 complete.** What exists today is the foundation and a
> proven end-to-end substrate. There is no decision engine, no ledger, and no
> money movement yet — those are Phases 2 through 4. Every claim below is
> something you can run.

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

- Docker Compose stack: PostgreSQL 16 + TimescaleDB, Redis 7, Redpanda, with
  topics created declaratively rather than by whoever produces first.
- Health endpoints in both services that round-trip all three dependencies and
  return `503` when any is unreachable. They report exception *types*, never
  messages, because the endpoint is unauthenticated and driver messages embed
  credentials.
- A Kafka consumer in salvage-core that validates every payload against the
  published JSON Schema, then writes the attempt and failure rows in one
  transaction, deduplicating on `event_id` at the database level.
- A read path in salvage-brain over those rows, scoped by merchant.
- Append-only enforcement and cross-tenant foreign keys in the schema, with
  tests that try to violate both.
- A contract drift gate that fails CI when the served API diverges from the
  committed one.

## What does not exist yet

The ledger, idempotency keys, the outbox, the bounds gate, the kill switch, the
saga coordinator, the simulator, the models, the policy, the evaluation
harness, the console, the MCP server, and any code that moves money. See
[docs/PHASE_0_SUMMARY.md](docs/PHASE_0_SUMMARY.md) for the exact boundary.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, components, data flow
- [EVALUATION.md](EVALUATION.md) — the specification the Phase 5 harness fills in
- [DECISIONS.md](DECISIONS.md) — index of architecture decision records
- [docs/OPEN_NUMBERS.md](docs/OPEN_NUMBERS.md) — where real-world figures are needed
- [docs/PHASE_0_SUMMARY.md](docs/PHASE_0_SUMMARY.md) — what Phase 0 delivered

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
