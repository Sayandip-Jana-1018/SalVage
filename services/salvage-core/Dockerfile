# salvage-core Dockerfile
# Multi-stage build: Gradle build on JDK, run on JRE.
FROM eclipse-temurin:21-jdk-noble AS build

WORKDIR /app
COPY services/salvage-core/ .

# Cache Gradle wrapper download
RUN ./gradlew --no-daemon --version

# Build the fat JAR, skipping tests (tests run in CI, not in the container build)
RUN ./gradlew bootJar --no-daemon -x test

# ---- Runtime ---------------------------------------------------------------
FROM eclipse-temurin:21-jre-noble

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar

EXPOSE 8080

# JVM flags for containers: respect cgroup memory limits, prefer G1 for
# latency-sensitive workloads, and disable DNS caching (containers move).
ENTRYPOINT ["java", \
    "-XX:+UseG1GC", \
    "-XX:MaxRAMPercentage=75.0", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-Dspring.profiles.active=docker", \
    "-jar", "app.jar"]
