plugins {
    java
    id("org.springframework.boot") version "3.5.16"
    id("io.spring.dependency-management") version "1.1.7"
    id("com.diffplug.spotless") version "7.0.2"
}

group = "com.salvage"
version = "0.1.0-SNAPSHOT"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

// ---------------------------------------------------------------------------
// Centralised dependency versions. Spring Boot's BOM manages the Spring and
// Spring-adjacent versions; we only pin things outside that BOM.
// ---------------------------------------------------------------------------
val testcontainersVersion = "1.20.6"

// Pinned to the 1.5.x line deliberately. json-schema-validator 3.x migrated to
// Jackson 3 (`tools.jackson.databind`), which cannot coexist with the Jackson 2
// that Spring Boot 3.5 manages. Moving to 3.x is gated on Spring Boot moving to
// Jackson 3, not on the version number looking newer.
val jsonSchemaValidatorVersion = "1.5.9"

dependencies {
    // ---- web + actuator ---------------------------------------------------
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-actuator")

    // ---- persistence ------------------------------------------------------
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    runtimeOnly("org.postgresql:postgresql")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")

    // ---- redis (cache only -- never source of truth, see ADR-0004) --------
    implementation("org.springframework.boot:spring-boot-starter-data-redis")

    // ---- kafka ------------------------------------------------------------
    implementation("org.springframework.kafka:spring-kafka")

    // ---- contract enforcement (ADR-0002) ----------------------------------
    // Inbound events are validated against the JSON Schema in contracts/ at
    // runtime, not just at build time. A malformed event is rejected at the
    // edge rather than corrupting the ledger.
    implementation("com.networknt:json-schema-validator:$jsonSchemaValidatorVersion")

    // ---- jackson for JSON -------------------------------------------------
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")

    // ---- test -------------------------------------------------------------
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.kafka:spring-kafka-test")
    testImplementation("org.testcontainers:testcontainers:$testcontainersVersion")
    testImplementation("org.testcontainers:junit-jupiter:$testcontainersVersion")
    testImplementation("org.testcontainers:postgresql:$testcontainersVersion")
    testImplementation("org.testcontainers:redpanda:$testcontainersVersion")
    testImplementation("org.awaitility:awaitility")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

// ---------------------------------------------------------------------------
// Contracts are the single source of truth (ADR-0002). The schemas live at
// the repository root in contracts/events/ and are copied onto the runtime
// classpath here, so there is exactly one copy in the repository and the
// service validates against the same bytes the Python side generates from.
// ---------------------------------------------------------------------------
val contractsDir = layout.projectDirectory.dir("../../contracts")

// A Copy task with an empty source directory reports NO-SOURCE and skips
// silently, including its own doFirst. That is how an image once got built
// with no schemas on the classpath: the build was green and the service only
// failed at startup. This separate check runs unconditionally.
val verifyEventContracts by tasks.registering {
    val eventsDir = contractsDir.dir("events").asFile
    doLast {
        val schemas = eventsDir.listFiles { file -> file.name.endsWith(".schema.json") }
        check(!schemas.isNullOrEmpty()) {
            "No event schemas found at $eventsDir. The contracts directory is the single " +
                "source of truth (ADR-0002) and must be on the build context; if this fails " +
                "inside Docker, the image is not copying contracts/ into place."
        }
    }
}

val copyEventContracts by tasks.registering(Copy::class) {
    dependsOn(verifyEventContracts)
    from(contractsDir.dir("events")) {
        include("*.schema.json")
    }
    into(layout.buildDirectory.dir("generated-resources/contracts/events"))
}

// The database bootstrap that ops/postgres/init runs on the compose stack is
// the same script Testcontainers must run, so it is shared rather than copied
// by hand. A second copy under src/test/resources drifted from the original
// the moment either changed.
val copyDatabaseInit by tasks.registering(Copy::class) {
    from(rootDir.resolve("../../ops/postgres/init")) {
        include("*.sql")
    }
    into(layout.buildDirectory.dir("generated-test-resources/db-init"))
}

sourceSets {
    main {
        output.dir(
            layout.buildDirectory.dir("generated-resources"),
            "builtBy" to copyEventContracts,
        )
    }
    test {
        output.dir(
            layout.buildDirectory.dir("generated-test-resources"),
            "builtBy" to copyDatabaseInit,
        )
    }
}

// ---------------------------------------------------------------------------
// Only the Spring Boot fat jar is produced. The plain jar the `java` plugin
// would otherwise emit alongside it makes `COPY build/libs/*.jar` in the
// Dockerfile ambiguous.
// ---------------------------------------------------------------------------
tasks.named<Jar>("jar") {
    enabled = false
}

spotless {
    java {
        target("src/**/*.java")
        removeUnusedImports()
        trimTrailingWhitespace()
        endWithNewline()
    }
    kotlinGradle {
        target("*.gradle.kts")
        trimTrailingWhitespace()
        endWithNewline()
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
        showStandardStreams = false
    }
}
