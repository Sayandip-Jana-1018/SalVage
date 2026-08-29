# salvage-core
#
# Build context is the REPOSITORY ROOT, not this directory: the Gradle build
# reads the event schemas from contracts/, which is the single source of truth
# (ADR-0002). Building from services/salvage-core alone would leave the
# schemas off the classpath and the service would fail to start.

# ---- build ----------------------------------------------------------------
FROM eclipse-temurin:21-jdk-noble AS build

# The image mirrors the repository layout rather than flattening the service
# to /app. The Gradle build resolves contracts/ as ../../contracts relative to
# the project directory; flattening broke that silently, producing a jar with
# no schemas on its classpath.
WORKDIR /src/services/salvage-core

# Dependency resolution is its own layer. Copying the whole tree first would
# invalidate the dependency cache on every source edit, which turns a ten
# second rebuild into a three minute one.
COPY services/salvage-core/gradle/ gradle/
COPY services/salvage-core/gradlew services/salvage-core/settings.gradle.kts \
     services/salvage-core/gradle.properties services/salvage-core/build.gradle.kts ./
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies --configuration runtimeClasspath \
    > /dev/null

COPY contracts/ /src/contracts/
COPY services/salvage-core/src/ src/

# Tests need Docker (Testcontainers) and are run by CI and `make test`, not
# during an image build where no Docker daemon is available.
RUN ./gradlew --no-daemon bootJar -x test

# ---- runtime --------------------------------------------------------------
FROM eclipse-temurin:21-jre-noble

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Runs unprivileged. A process that only needs to open a socket and talk to
# PostgreSQL has no reason to be root inside its container.
RUN useradd --system --uid 10001 --create-home --shell /usr/sbin/nologin salvage

WORKDIR /app
COPY --from=build --chown=salvage:salvage \
     /src/services/salvage-core/build/libs/*.jar app.jar
USER salvage

EXPOSE 8080

# MaxRAMPercentage rather than a fixed -Xmx so the heap tracks whatever the
# container limit is. ExitOnOutOfMemoryError so an OOM kills the process and
# lets the orchestrator restart it, instead of leaving a JVM alive but unable
# to make progress -- which looks healthy to a TCP check and is not.
ENTRYPOINT ["java", \
    "-XX:+UseG1GC", \
    "-XX:MaxRAMPercentage=75.0", \
    "-XX:+ExitOnOutOfMemoryError", \
    "-Dspring.profiles.active=docker", \
    "-jar", "app.jar"]
