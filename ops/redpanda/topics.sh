#!/usr/bin/env bash
# Creates Kafka topics for Salvage.
#
# Runs as a one-shot init container (see docker-compose.yml, service
# redpanda-init). Auto-topic-create is disabled so that topic configuration
# (partition count, retention, cleanup policy) is version-controlled here
# rather than being whatever a producer happened to trigger first.
#
# Idempotent: rpk topic create is a no-op if the topic already exists.

set -euo pipefail

: "${RPK_BROKERS:=redpanda:9092}"

echo "Salvage topic init — brokers: ${RPK_BROKERS}"

# Ensure auto topic creation is disabled on cluster
rpk cluster config set auto_create_topics_enabled false --brokers "${RPK_BROKERS}" || true

# ---- payment domain -------------------------------------------------------
# payment.failed.v1 — the primary input event. One partition per merchant in
# production; 3 locally so concurrent-worker tests can exercise partition
# assignment. Retention is 7 days; failures older than that are reconciled
# from the ledger, not from Kafka.
rpk topic create payment.failed.v1 \
  --brokers "${RPK_BROKERS}" \
  --partitions 3 \
  --topic-config retention.ms=604800000 \
  --topic-config cleanup.policy=delete \
  || true

# ---- outbox relay ----------------------------------------------------------
# salvage.outbox.v1 — transactional outbox events published by the outbox
# poller in salvage-core. Consumed by downstream processors and the brain.
# Compacted so that the latest state per key survives indefinitely.
rpk topic create salvage.outbox.v1 \
  --brokers "${RPK_BROKERS}" \
  --partitions 3 \
  --topic-config cleanup.policy=compact \
  --topic-config min.compaction.lag.ms=60000 \
  || true

# ---- decision events -------------------------------------------------------
# salvage.decisions.v1 — emitted after every decision for downstream
# analytics, the eval harness, and the console's live feed.
rpk topic create salvage.decisions.v1 \
  --brokers "${RPK_BROKERS}" \
  --partitions 3 \
  --topic-config retention.ms=2592000000 \
  --topic-config cleanup.policy=delete \
  || true

# ---- rail health -----------------------------------------------------------
# salvage.rail-health.v1 — aggregated rail health snapshots for cross-service
# consumption. Short retention; the authoritative store is TimescaleDB.
rpk topic create salvage.rail-health.v1 \
  --brokers "${RPK_BROKERS}" \
  --partitions 1 \
  --topic-config retention.ms=86400000 \
  --topic-config cleanup.policy=delete \
  || true

echo "Salvage topic init — done."
rpk topic list --brokers "${RPK_BROKERS}"
