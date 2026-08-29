plugins {
    java
    id("org.springframework.boot") version "3.5.16"
    id("io.spring.dependency-management") version "1.1.7"
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
val resilience4jVersion = "2.3.0"
val testcontainersVersion = "1.20.6"

dependencies {
    // ---- web + actuator ---------------------------------------------------
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-actuator")

    // ---- persistence ------------------------------------------------------
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    runtimeOnly("org.postgresql:postgresql")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")

    // ---- redis (cache only — never source of truth, see ADR-0004) ---------
    implementation("org.springframework.boot:spring-boot-starter-data-redis")

    // ---- kafka ------------------------------------------------------------
    implementation("org.springframework.kafka:spring-kafka")

    // ---- resilience -------------------------------------------------------
    implementation("io.github.resilience4j:resilience4j-spring-boot3:$resilience4jVersion")

    // ---- jackson for JSON -------------------------------------------------
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")

    // ---- test -------------------------------------------------------------
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.kafka:spring-kafka-test")
    testImplementation("org.testcontainers:testcontainers:$testcontainersVersion")
    testImplementation("org.testcontainers:junit-jupiter:$testcontainersVersion")
    testImplementation("org.testcontainers:postgresql:$testcontainersVersion")
    testImplementation("org.testcontainers:kafka:$testcontainersVersion")
    testImplementation("org.awaitility:awaitility")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test> {
    useJUnitPlatform()
    // Testcontainers reuse requires this; without it, every test class spins
    // up and tears down a full container set, which makes the chaos suite
    // take hours instead of minutes.
    systemProperty("testcontainers.reuse.enable", "true")
}
