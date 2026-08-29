#!/usr/bin/env bash
# Creates Kafka topics for Salvage.
#
# Runs as a one-shot init container (see docker-compose.yml, service
# redpanda-init). Auto-topic-create is disabled so that topic configuration
# (partition count, retention, cleanup policy) is version-controlled here
# rather than being whatever a producer happened to trigger first.
#
# This script fails loudly. An earlier version appended `|| true` to every
# command, which meant an unreachable broker or a rejected config produced a
# green `make up` and a stack with no topics. The only tolerated failure is
# "topic already exists", which is what makes re-running this idempotent.

set -euo pipefail

: "${RPK_BROKERS:=redpanda:9092}"
: "${RPK_ADMIN_HOSTS:=redpanda:9644}"

echo "Salvage topic init - brokers: ${RPK_BROKERS} admin: ${RPK_ADMIN_HOSTS}"

# Turn off auto topic creation at the cluster level.
#
# Two things here are easy to get wrong. It is not a `--set` flag on
# `redpanda start` -- Redpanda v25 rejects that property on the command line.
# And `rpk cluster config` talks to the Admin API on 9644, not the Kafka API on
# 9092, so it takes `-X admin.hosts` and rejects `--brokers`.
rpk cluster config set auto_create_topics_enabled false \
  -X admin.hosts="${RPK_ADMIN_HOSTS}"

# create_topic <name> <partitions> <config>...
create_topic() {
  local name="$1"
  local partitions="$2"
  shift 2

  local args=()
  local cfg
  for cfg in "$@"; do
    args+=(--topic-config "${cfg}")
  done

  local output
  if output=$(rpk topic create "${name}" \
                --brokers "${RPK_BROKERS}" \
                --partitions "${partitions}" \
                "${args[@]}" 2>&1); then
    echo "  created ${name}"
    return 0
  fi

  # rpk reports an existing topic on stdout with a non-zero exit in some
  # versions. Tolerate exactly that and nothing else.
  if grep -qiE "already exists|TOPIC_ALREADY_EXISTS" <<<"${output}"; then
    echo "  exists  ${name}"
    return 0
  fi

  echo "  FAILED  ${name}" >&2
  echo "${output}" >&2
  return 1
}

# ---- payment domain -------------------------------------------------------
# The primary input event. Three partitions locally so concurrent-worker tests
# can exercise partition assignment. Seven-day retention: anything older is
# reconciled from the ledger, which is the durable record, not from Kafka.
create_topic salvage.payment-failed.v1 3 \
  retention.ms=604800000 \
  cleanup.policy=delete

# ---- outbox relay ---------------------------------------------------------
# Transactional outbox events published by the outbox poller in salvage-core.
#
# cleanup.policy is `delete`, deliberately NOT `compact`. Compaction keeps only
# the newest record per key and discards earlier ones. These are events -- an
# ordered sequence of facts about what happened -- so compaction would silently
# destroy history for any key that appears twice, which is precisely what an
# audit trail must never do. Retention is long instead.
create_topic salvage.outbox.v1 3 \
  retention.ms=2592000000 \
  cleanup.policy=delete

# ---- decision events ------------------------------------------------------
# Emitted after every decision for downstream analytics, the eval harness, and
# the console's live feed. Same reasoning as the outbox: facts, not state.
create_topic salvage.decisions.v1 3 \
  retention.ms=2592000000 \
  cleanup.policy=delete

# ---- rail health ----------------------------------------------------------
# Aggregated rail health snapshots. Short retention; the authoritative store is
# the TimescaleDB hypertable.
create_topic salvage.rail-health.v1 1 \
  retention.ms=86400000 \
  cleanup.policy=delete

echo "Salvage topic init - done."
rpk topic list --brokers "${RPK_BROKERS}"
