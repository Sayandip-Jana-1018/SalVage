# Deploying Salvage

This is the file to follow when you are putting Salvage somewhere other than
your laptop. It assumes one Linux host with Docker and Docker Compose. That is
a deliberate ceiling: one host is enough for a pilot with one merchant, it is
something one person can operate, and it is honest about what has actually been
built. There is no Kubernetes manifest here because none has been written and
none has been tested, and a chart nobody has run is a liability rather than a
deliverable.

Read [`docs/PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md) before you are on
call for this.

---

## 0. What you are deploying

Five containers plus three infrastructure containers:

| Container | What it is | Listens on |
|---|---|---|
| `salvage-core` | Java 21. The money service: ingest, ledger, bounds engine, sagas, the payment provider port. | `127.0.0.1:8081` |
| `salvage-brain` | Python 3.12. The decision service: sensing, diagnosis, policy, the language layer. Never moves money. | `127.0.0.1:8001` |
| `salvage-console` | Next.js. The operator interface. **Runs as an operator key.** | `127.0.0.1:3000` |
| `postgres` | TimescaleDB 16. Source of truth. | compose network only |
| `redis` | Idempotency cache and rate limiter windows. | compose network only |
| `redpanda` | Kafka API. The ingest topic. | compose network only |

Nothing binds to a public interface. You put a TLS terminator in front — that
part is section 4 and it is not optional.

---

## 1. Before you start

You need, on the host:

- Docker 24+ and the Compose plugin
- A DNS name you control, and a way to get a certificate for it
- Somewhere to put database backups that is not this host

And you need to have decided **which merchant's traffic this will see**, because
everything below is tenant-scoped and the keys you generate in the next step
name tenants.

---

## 2. Secrets

Copy the template and fill it in. **Nothing in it has a working default in
production** — `docker-compose.prod.yml` uses `${VAR:?}` throughout, so a
missing value stops the deployment and names the variable rather than quietly
running on `salvage_local_dev_only`.

```bash
cp .env.example .env.prod
```

Generate the passwords rather than typing them:

```bash
printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -base64 32)" >> .env.prod
```

```bash
printf 'REDIS_PASSWORD=%s\n' "$(openssl rand -base64 32)" >> .env.prod
```

### API keys

Every API route in both services requires `Authorization: Bearer <key>`. Two
scopes, and the difference matters:

- **`merchant`** — bound to one tenant. Reaching for another is answered 404,
  never 403, because a 403 confirms the other tenant exists.
- **`operator`** — may address every tenant. This is what the console runs as.
  Never issue one to a customer.

```bash
./scripts/generate_api_key.sh operator
```

```bash
./scripts/generate_api_key.sh merchant merch_acme
```

Each run prints the key **once** and the configuration entry to store. The entry
is a SHA-256 — a leak of `.env.prod` does not leak a usable credential. Put the
key itself in a password manager and hand it to the merchant over a channel
that is not email.

Collect the entries into one variable, and put the operator key in a second:

```
SALVAGE_API_KEYS=operator:*:<hash>,merchant:merch_acme:<hash>
SALVAGE_CONSOLE_API_KEY=<the operator key itself, not its hash>
```

**Revoking a key** is deleting its entry from `SALVAGE_API_KEYS` and restarting
the two services. There is no revocation list and no expiry; that is a real
limitation and it is in section 8.

---

## 3. Bring it up

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The first build takes several minutes: it compiles the Java service, installs
the Python dependencies from the lock file, and builds the console. Then:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Every container should read `healthy`. `salvage-core` is the slow one — it runs
Flyway migrations against an empty database on first start.

If a service exits immediately, read its logs before anything else. The two
failures that are supposed to happen are worth recognising:

- `salvage.auth.required is true and salvage.auth.api-keys is empty` — you did
  not set `SALVAGE_API_KEYS`. The service refused to start open. This is the
  system working.
- `required variable ... is missing a value` — compose refused before starting
  anything, and it names the variable.

---

## 4. TLS and the reverse proxy

**Do not skip this.** The three application ports bind to `127.0.0.1` precisely
so that this step is required rather than optional. API keys travel in an
`Authorization` header; over plain HTTP on a shared network they are readable by
anyone on the path.

Put a terminator in front — Caddy, nginx, or your cloud's load balancer — and
route:

| Public host | To |
|---|---|
| `api.your-domain` | `127.0.0.1:8081` (salvage-core) |
| `decide.your-domain` | `127.0.0.1:8001` (salvage-brain) |
| `console.your-domain` | `127.0.0.1:3000` |

Two rules for the console host that are not negotiable:

1. **Put your own authentication in front of it.** The console holds an operator
   key, so anyone who reaches it can read every tenant. It has no login page of
   its own — that is stated plainly rather than implied, and it is why this
   belongs on a VPN, behind SSO, or behind an IP allowlist.
2. **Never expose it to the public internet** while that is true.

A minimal Caddyfile, for the shape rather than as a drop-in:

```
api.your-domain {
    reverse_proxy 127.0.0.1:8081
}

console.your-domain {
    forward_auth your-sso:9091 {
        uri /api/verify
        copy_headers Remote-User
    }
    reverse_proxy 127.0.0.1:3000
}
```

---

## 5. Prove it before you point traffic at it

Run these in order. Each one fails loudly if the thing it checks is wrong.

**The services answer:**

```bash
curl -fsS https://api.your-domain/health/readiness
```

**A merchant key reads its own tenant:**

```bash
curl -fsS -H "Authorization: Bearer $MERCHANT_KEY" https://api.your-domain/api/v1/telemetry/merchants/merch_acme/stats
```

**And cannot read another one.** This must print `404`. If it prints anything
else, stop and do not proceed:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $MERCHANT_KEY" https://api.your-domain/api/v1/telemetry/merchants/somebody_else/stats
```

**An anonymous request is refused.** This must print `401`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.your-domain/api/v1/telemetry/merchants/merch_acme/stats
```

**The ledger chain verifies:**

```bash
curl -fsS -H "Authorization: Bearer $OPERATOR_KEY" https://api.your-domain/api/v1/ledger/merchants/merch_acme/verify
```

An empty chain returns `valid: true` with `verified_entries: 0`. That is not
evidence anything was recorded — it is an empty chain verifying trivially, and
the console says so too.

---

## 6. Ingesting real traffic

Salvage does not scrape anybody's dashboard. The merchant publishes a
`payment_failed.v1` event when a payment fails, either to the Kafka topic
directly or through their own integration. The schema is the single source of
truth and is enforced at both ends:

```
contracts/events/payment_failed.v1.schema.json
```

`additionalProperties: false` is set, so an unexpected field is a contract
violation rather than something silently dropped. `EventContractValidator`
validates every inbound payload at runtime, and
`PaymentFailedEventContractTest` fails the build if the Java record and the
schema disagree.

**Start in shadow mode.** `SALVAGE_PAYMENT_PROVIDER=simulated` means the system
ingests, diagnoses, decides and records — and executes nothing against a real
gateway. That is the configuration for a pilot: you get a full audit trail of
what it *would* have done, comparable against what actually happened, with no
money at risk. Switch to `razorpay` only when someone has read
[ADR-0003](adr/0003-payment-provider-abstraction.md) and means it.

---

## 7. Operating it

**Backups.** The ledger is the point of this system; losing it loses the audit
trail. Nightly, off this host:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "salvage-$(date +%F).sql.gz"
```

A backup you have never restored is a hypothesis. Restore one into a scratch
database and run the chain verification against it.

**Upgrades.** Pull, rebuild, restart. Flyway migrates forward on start.
`docker-compose.prod.yml` has `restart: unless-stopped`, so a failed migration
leaves a container restart-looping rather than a half-migrated database serving
traffic. Read the logs before assuming a rollback.

**Rollback.** Redeploy the previous image tag. Do **not** roll the database back
under a running service — the ledger is append-only and the migrations are
forward-only. If a migration is the problem, restore from backup.

**Logs** rotate at 20 MB × 5 files per container, set in the compose file.

**Dashboards.** `ops/grafana/` holds dashboards as code. Wiring a Prometheus and
a Grafana to this deployment is not automated and is not in this file, because
nobody has done it here.

---

## 8. What this deployment does not give you

Stated plainly, because finding these out later is expensive:

- **No key expiry and no revocation list.** Revoking is editing the environment
  and restarting. For a handful of pilot tenants that is workable; it does not
  scale to self-service.
- **No rate limiting at the edge.** The bounds engine limits what Salvage does
  to a customer. It does not limit what a caller does to Salvage. Put that in
  your reverse proxy.
- **No audit log of API reads.** Writes land in the hash-chained ledger. Reads
  are not recorded, so "who looked at this merchant's data" is unanswerable.
- **No high availability.** One host, one PostgreSQL, one Redpanda. A host
  failure is an outage, and recovery is restore-from-backup.
- **No secrets manager.** Credentials are environment variables in a file on the
  host. Docker secrets or your cloud's vault would be better, and neither is
  wired up here.
- **The reconciliation sweep is not built.** `provider_operations` rows left in
  `UNKNOWN` are money whose fate the system does not know, and nothing runs
  periodically to resolve them. Until it exists, `UNKNOWN` rows need a human
  looking at them.

Every one of those is a real gap, none of them is hidden in the code, and the
first three are the ones a customer's security review will ask about.
