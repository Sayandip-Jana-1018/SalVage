# salvage-brain
#
# Build context is the REPOSITORY ROOT (see docker-compose.yml).

FROM python:3.12-slim-bookworm

# uv, pinned. Installing from the published image avoids a curl-pipe-to-shell
# in the build and keeps the resolver version reproducible.
COPY --from=ghcr.io/astral-sh/uv:0.12.7 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, from the lockfile, as their own cache layer.
#
# `--frozen` makes the build fail if uv.lock is out of date rather than
# silently resolving something different from what CI tested. `--no-dev`
# keeps pytest, mypy and the rest out of the runtime image.
#
# Note there is no `| tail -n` here. Piping a build command through tail
# replaces its exit status with tail's, which always succeeds -- the previous
# Dockerfile did exactly that, so a failed install produced a working image
# with no dependencies in it and no error.
COPY services/salvage-brain/pyproject.toml services/salvage-brain/uv.lock \
     services/salvage-brain/README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY services/salvage-brain/src/ src/
RUN uv sync --frozen --no-dev

RUN useradd --system --uid 10001 --create-home --shell /usr/sbin/nologin salvage \
 && chown -R salvage:salvage /app
USER salvage

EXPOSE 8000

CMD ["uvicorn", "salvage_brain.main:app", "--host", "0.0.0.0", "--port", "8000"]
