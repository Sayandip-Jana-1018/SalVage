# Salvage Production Operations & SRE Runbook

This document serves as the operational guide for on-call engineers, SREs, and payment operations teams supporting the **Salvage Autonomous Payment Recovery Platform**.

---

## 1. System Topology & Core Ports

| Service | Port | Protocol | Purpose | Health Check |
|---|---|---|---|---|
| `salvage-core` | `8080` | HTTP / gRPC | Financial money core, Bounds Engine, Ledger, Saga Coordinator | `GET /actuator/health` |
| `salvage-brain` | `8000` | HTTP (FastAPI) | Sense & Diagnose, Taxonomy Classifier, Expected Net Utility Optimizer | `GET /health` |
| `salvage-mcp` | stdio | JSON-RPC | Model Context Protocol Server for advisory AI assistants | `mcp:tools/list` |
| `salvage-console` | `3000` | HTTP (Next.js) | Operator Console (War Room, Autopsy, Policy Sandbox) | `GET /` |
| `PostgreSQL 16` | `5432` | TCP | Ledger records, failure events, transactional outbox | `pg_isready` |
| `Redis 7` | `6379` | TCP | Distributed locks, sliding-window rate limiters, sensing cache | `PING -> PONG` |
| `Redpanda / Kafka`| `9092` | TCP | Event streaming (`salvage.payment-failed.v1`) | `rpk cluster info` |

---

## 2. Incident Severity Levels & Triage Workflows

### SEV-1: Critical Recovery Blockage or Brain Offline
- **Symptoms**:
  - `salvage-brain` healthcheck returns 5xx or connection timeout.
  - Decision throughput drops to 0.
- **Fail-Closed Behavior**:
  - `salvage-core` automatically fails closed: fallback policy is `NO_ACTION` to ensure **no unverified money movement occurs**.
- **Remediation Steps**:
  1. Inspect brain container logs:
     ```bash
     docker compose --profile apps logs --tail 100 -f salvage-brain
     ```
  2. Verify Redis and PostgreSQL connectivity from the brain container:
     ```bash
     docker compose exec salvage-brain python -c "import redis; r = redis.Redis(host='redis'); print(r.ping())"
     ```
  3. Restart brain service:
     ```bash
     docker compose restart salvage-brain
     ```

---

### SEV-2: Active Issuer Outage
- **Symptoms**:
  - Sensing matrix reports a rail whose 5m sliding-window success rate has
    fallen below the `DEGRADED` threshold, or which has crossed the
    consecutive-timeout threshold.
  - Active incidents card appears in **The War Room**.
- **Automated Mitigation**:
  - The expected-net-value optimiser de-weights the degraded rail. It chooses
    `SWITCH_RAIL` **only if a healthy alternative rail has actually been
    observed**; during a broad outage where nothing is healthy, `SWITCH_RAIL`
    is removed from the candidate set entirely and the optimiser falls through
    to the next action it can carry out. There is no default target rail.
- **Operator Verification**:
  1. Open the Operator Console at `http://localhost:3000/war-room`.
  2. Confirm the degraded rail's verdict and window statistics.
  3. Query rail health via MCP:
     ```bash
     # MCP Tool: get_rail_health(rail_id="<issuer>|<method>|<provider>")
     ```

> Rail identifiers are written as `issuer|method|provider`. No specific
> issuer is named in this runbook: naming one alongside an example error rate
> would attribute an invented figure to a real institution, which
> [ADR-0006](adr/0006-numbers-policy.md) forbids.

---

### SEV-3: Tamper-Evident Ledger Integrity Alert
- **Symptoms**:
  - Prometheus alert `salvage_ledger_tamper_detected_total > 0`.
  - Hash chain verification fails ($H(i) \neq \text{sha256}(H(i-1) \parallel \text{payload})$).
- **Remediation Steps**:
  1. **DO NOT OVERWRITE LEDGER**.
  2. Run the offline cryptographic verification drill:
     ```bash
     python scripts/e2e_demo.py
     ```
  3. Identify the mutated row index via PostgreSQL hash check query.
  4. Escalate immediately to Security and Engineering Leads.

---

## 3. Safety Bounds & Emergency Controls

### Emergency Global Kill Switch
To immediately halt all automated recovery actions without stopping ingestion:
```bash
# Set global emergency kill switch key in Redis
docker compose exec redis redis-cli SET "salvage:bounds:kill_switch:global" "ACTIVE"
```
When active, the Bounds Engine rejects all candidate actions with reason `GLOBAL_KILL_SWITCH_ACTIVE` and executes `NO_ACTION`.

To restore normal operation:
```bash
docker compose exec redis redis-cli DEL "salvage:bounds:kill_switch:global"
```

---

### Quiet Hours Override
Quiet Hours are strictly hard-coded in Java `QuietHoursGuard.java` (22:00 to 08:00 IST).
- Nudges and interactive recovery actions are **always blocked** during this window.
- In background batch processing, only non-intrusive delayed retries scheduled for the next morning (08:30 IST) are permitted.

---

## 4. Disaster Recovery & Database Maintenance

### Database Backup
```bash
docker compose exec postgres pg_dump -U salvage -d salvage -Fc -f /var/lib/postgresql/backup/salvage_$(date +%Y%m%d_%H%M%S).dump
```

### Hash Chain Full Audit
```bash
docker compose exec salvage-core java -jar /app/salvage-core.jar --audit-ledger-integrity
```
