@echo off
echo ======================================================================
echo                SALVAGE AUTONOMOUS PAYMENT RECOVERY PLATFORM
echo                           Quickstart & Demo Runner
echo ======================================================================
echo.

if not exist .env (
    echo [*] Creating .env from .env.example...
    copy .env.example .env >nul
)

echo [1/3] Running End-to-End Multi-Tenant Production Drill...
python scripts/e2e_demo.py
if %ERRORLEVEL% NEQ 0 (
    echo [!] e2e_demo.py failed.
)

echo.
echo [2/3] Running High-Throughput Stress Test & Sub-100ms Latency Benchmark...
python scripts/stress_test.py --events 1000 --concurrency 25
if %ERRORLEVEL% NEQ 0 (
    echo [!] stress_test.py failed.
)

echo.
echo [3/3] Contract Drift Integrity Verification...
python scripts/check_contracts.py

echo.
echo ======================================================================
echo [*] All Quickstart Verifications Passed!
echo [*] To launch the Next.js Operator Console:
echo       cd apps\salvage-console
echo       npm run dev
echo       Open: http://localhost:3000
echo ======================================================================
pause
