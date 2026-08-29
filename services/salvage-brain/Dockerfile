# salvage-brain Dockerfile
FROM python:3.12-slim-bookworm

# System deps for psycopg2 and confluent-kafka
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq-dev gcc curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (Docker layer cache)
COPY services/salvage-brain/pyproject.toml .
RUN pip install --no-cache-dir -e "." 2>&1 | tail -5

# Copy source
COPY services/salvage-brain/src/ src/

EXPOSE 8000

CMD ["uvicorn", "salvage_brain.main:app", "--host", "0.0.0.0", "--port", "8000"]
