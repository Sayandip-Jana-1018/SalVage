#!/usr/bin/env bash
# Bootstrap the Gradle wrapper for salvage-core.
# Requires: JDK 21 on PATH, curl.
set -euo pipefail

GRADLE_VERSION="8.12"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/../services/salvage-core" && pwd)"

if [ -f "$CORE_DIR/gradle/wrapper/gradle-wrapper.jar" ] && [ -f "$CORE_DIR/gradlew" ]; then
    echo "Gradle wrapper already exists at $CORE_DIR"
    exit 0
fi

echo "==> Downloading Gradle ${GRADLE_VERSION}..."
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

curl -fsSL -o "$TMPDIR/gradle.zip" \
    "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip"

echo "==> Extracting with jar..."
cd "$TMPDIR"
jar xf gradle.zip

echo "==> Fixing permissions..."
chmod +x "$TMPDIR/gradle-${GRADLE_VERSION}/bin/gradle"

echo "==> Generating wrapper..."
"$TMPDIR/gradle-${GRADLE_VERSION}/bin/gradle" wrapper \
    --gradle-version "$GRADLE_VERSION" \
    --no-daemon 2>&1

echo "==> Installing wrapper into $CORE_DIR..."
mkdir -p "$CORE_DIR/gradle/wrapper"
cp -v "$TMPDIR/gradle/wrapper/gradle-wrapper.jar" "$CORE_DIR/gradle/wrapper/"
cp -v "$TMPDIR/gradlew" "$CORE_DIR/"
cp -v "$TMPDIR/gradlew.bat" "$CORE_DIR/"
chmod +x "$CORE_DIR/gradlew"

echo "==> Done."
ls -la "$CORE_DIR/gradle/wrapper/" "$CORE_DIR/gradlew"
