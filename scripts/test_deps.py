import time
import psycopg2
import redis
from confluent_kafka.admin import AdminClient

print("--- Checking PostgreSQL ---")
try:
    conn = psycopg2.connect("postgresql://salvage:salvage_local_dev_only@127.0.0.1:5432/salvage")
    cur = conn.cursor()
    cur.execute("SELECT 1")
    print("Postgres OK:", cur.fetchone())
    conn.close()
except Exception as e:
    print("Postgres Error:", e)

print("--- Checking Redis ---")
try:
    r = redis.Redis(host="127.0.0.1", port=6379, socket_timeout=3)
    print("Redis OK:", r.ping())
except Exception as e:
    print("Redis Error:", e)

print("--- Checking Kafka/Redpanda ---")
try:
    admin = AdminClient({"bootstrap.servers": "127.0.0.1:19092", "socket.timeout.ms": 3000})
    meta = admin.list_topics(timeout=5)
    print("Kafka OK, topics:", list(meta.topics.keys()))
except Exception as e:
    print("Kafka Error:", e)
