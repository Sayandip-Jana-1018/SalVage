package com.salvage.core.ingest;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.redpanda.RedpandaContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * The real infrastructure an integration test runs against.
 *
 * <p>Three deliberate choices:
 *
 * <ol>
 *   <li><strong>Containers start in a static initialiser</strong>, not in
 *       {@code @BeforeAll}. {@code @DynamicPropertySource} is evaluated while
 *       Spring builds the context, and the relative ordering of that against a
 *       user {@code @BeforeAll} is subtle enough that relying on it is a bug
 *       waiting to happen. Static initialisation runs before either, always.</li>
 *   <li><strong>Redpanda, not Confluent Kafka.</strong> Production runs
 *       Redpanda. Testing against a different broker implementation than the
 *       one being shipped means the tests validate a system nobody deploys.</li>
 *   <li><strong>No {@code @EnabledIf} Docker guard.</strong> The previous
 *       version skipped itself when Docker was unavailable, which meant a CI
 *       runner without Docker produced a green build containing zero
 *       integration coverage. If Docker is missing, this fails loudly.</li>
 * </ol>
 *
 * <p>Image tags match docker-compose.yml exactly. A test passing against a
 * different PostgreSQL or Redis version than production runs proves less than
 * it appears to.
 *
 * <p>The containers are process-lifetime singletons shared by every test class
 * that extends this. Starting a fresh set per class would multiply a forty
 * second suite by the number of classes. They are stopped by the shutdown hook
 * below; Testcontainers' Ryuk sidecar is the backstop if the JVM dies first.
 */
public abstract class SalvageInfrastructure {

    protected static final PostgreSQLContainer<?> POSTGRES = postgres();
    protected static final GenericContainer<?> REDIS = redis();
    protected static final RedpandaContainer REDPANDA = redpanda();

    static {
        POSTGRES.start();
        REDIS.start();
        REDPANDA.start();
        Runtime.getRuntime().addShutdownHook(new Thread(SalvageInfrastructure::stopAll));
    }

    // The @SuppressWarnings sits on these factories rather than on a static
    // block, which is not a declaration and cannot carry an annotation. The
    // containers outlive every method here on purpose; see the class comment.
    @SuppressWarnings("resource")
    private static PostgreSQLContainer<?> postgres() {
        return new PostgreSQLContainer<>(
                DockerImageName.parse("timescale/timescaledb:2.29.2-pg16")
                        .asCompatibleSubstituteFor("postgres"))
                .withDatabaseName("salvage_test")
                .withUsername("salvage")
                .withPassword("salvage_test")
                // Mirrors ops/postgres/init/01-extensions.sql. The file is
                // shared rather than duplicated: see build.gradle.kts, which
                // copies it onto the test classpath.
                .withInitScript("db-init/01-extensions.sql");
    }

    @SuppressWarnings("resource")
    private static GenericContainer<?> redis() {
        return new GenericContainer<>(DockerImageName.parse("redis:7.4.11-bookworm"))
                .withExposedPorts(6379);
    }

    // No @SuppressWarnings here: this is a bare constructor with no builder
    // chain, so the resource analysis never flags it, and suppressing a
    // category that was not reported is itself reported (Java 1102).
    private static RedpandaContainer redpanda() {
        return new RedpandaContainer(DockerImageName.parse("redpandadata/redpanda:v25.3.17"));
    }

    private static void stopAll() {
        REDPANDA.stop();
        REDIS.stop();
        POSTGRES.stop();
    }

    @DynamicPropertySource
    static void infrastructureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);

        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));

        registry.add("spring.kafka.bootstrap-servers", REDPANDA::getBootstrapServers);

        // The compose stack creates topics from ops/redpanda/topics.sh. In
        // tests the broker is ephemeral, so the listener is allowed to create
        // the topic it subscribes to rather than reproducing that script here.
        registry.add("spring.kafka.consumer.auto-offset-reset", () -> "earliest");
    }
}
