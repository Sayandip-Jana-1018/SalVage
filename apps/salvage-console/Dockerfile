# The operator console, built for deployment.
#
# Multi-stage, and the last stage carries no toolchain: Node's runtime, the
# standalone server Next.js emits, and nothing else. A production image holding
# a package manager and a compiler is a larger attack surface for no benefit.
#
# Build from the repository root:
#   docker build -f apps/salvage-console/Dockerfile -t salvage-console .

FROM node:22.22.0-bookworm-slim AS deps
WORKDIR /app
COPY apps/salvage-console/package.json apps/salvage-console/package-lock.json ./
# `npm ci` rather than `npm install`: it installs exactly what the lock file
# says or it fails, which is the difference between a reproducible image and a
# resolution that happened to run today.
RUN npm ci

FROM node:22.22.0-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/salvage-console ./
# The build type-checks every route and page against the wire types, so a
# console that disagrees with the services it reads does not produce an image.
RUN npm run build

FROM node:22.22.0-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Never root. The console holds an operator API key in its environment; a
# container escape from a root process is a worse day than one from nobody.
RUN groupadd --system --gid 1001 salvage \
 && useradd --system --uid 1001 --gid salvage salvage

COPY --from=build --chown=salvage:salvage /app/.next/standalone ./
COPY --from=build --chown=salvage:salvage /app/.next/static ./.next/static
COPY --from=build --chown=salvage:salvage /app/public ./public

USER salvage
EXPOSE 3000

# No HEALTHCHECK curl: this image has no curl, deliberately. The compose file
# probes the port with Node instead.
CMD ["node", "server.js"]
