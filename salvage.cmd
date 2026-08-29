@echo off
REM Salvage development helper for Windows (where make is not installed).
REM Usage: salvage.cmd <target>
REM
REM This is a convenience wrapper. The canonical build system is the Makefile.
REM Install make via: scoop install make, or winget install GnuWin32.Make

setlocal enabledelayedexpansion

set TARGET=%1
if "%TARGET%"=="" (
    echo Usage: salvage.cmd ^<target^>
    echo.
    echo Targets:
    echo   up          Start infrastructure (PostgreSQL, Redis, Redpanda)
    echo   down        Stop all services
    echo   test        Run all tests
    echo   test-java   Run Java tests only
    echo   test-python Run Python tests only
    echo   lint        Run all linters
    echo   ps          Show container status
    echo   logs        Tail container logs
    echo   clean       Stop, remove volumes, reset
    echo   demo        Run end-to-end demo
    exit /b 0
)

if "%TARGET%"=="up" (
    docker compose up -d postgres redis redpanda redpanda-init
    echo Waiting for services...
    timeout /t 10 /nobreak >nul
    echo Infrastructure ready.
    echo   PostgreSQL: localhost:5432
    echo   Redis:      localhost:6379
    echo   Redpanda:   localhost:19092
    exit /b 0
)

if "%TARGET%"=="down" (
    docker compose down
    exit /b 0
)

if "%TARGET%"=="clean" (
    docker compose down -v --remove-orphans
    exit /b 0
)

if "%TARGET%"=="ps" (
    docker compose ps
    exit /b 0
)

if "%TARGET%"=="logs" (
    docker compose logs -f
    exit /b 0
)

if "%TARGET%"=="test" (
    call :test-java
    call :test-python
    exit /b 0
)

if "%TARGET%"=="test-java" (
    call :test-java
    exit /b 0
)

if "%TARGET%"=="test-python" (
    call :test-python
    exit /b 0
)

if "%TARGET%"=="lint" (
    cd services\salvage-brain
    python -m ruff check src\ tests\
    python -m mypy src\ --ignore-missing-imports
    cd ..\..
    exit /b 0
)

if "%TARGET%"=="demo" (
    echo Demo target will be wired in Phase 4.
    echo For now, verify with: salvage.cmd up ^&^& salvage.cmd test
    exit /b 0
)

echo Unknown target: %TARGET%
exit /b 1

:test-java
cd services\salvage-core
call gradlew.bat test --no-daemon
cd ..\..
exit /b 0

:test-python
cd services\salvage-brain
python -m pytest tests\ -v
cd ..\..
exit /b 0
