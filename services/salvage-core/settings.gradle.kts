// The foojay resolver lets Gradle download a matching JDK when the machine
// has no Java 21 installed. Combined with the toolchain block in
// build.gradle.kts, this is what makes "clone and build" work on a clean
// machine without a documented JDK install step.
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "salvage-core"
