# Salvage -- start everything, for development.
#
#   .\start.ps1
#
# Brings up PostgreSQL, Redis and Redpanda, creates the Kafka topics, builds and
# starts salvage-core and salvage-brain, then runs the console in the
# foreground. Ctrl-C stops the console; the containers keep running until you
# run `.\start.ps1 -Stop`.
#
# -----------------------------------------------------------------------------
# THIS IS NOT A DEPLOYMENT SCRIPT, AND IT MUST NOT BECOME ONE.
#
# It runs docker-compose.yml, which sets SALVAGE_AUTH_REQUIRED=false. Every API
# endpoint on both services will answer any caller for any tenant, the database
# password is the one checked into the repository, and every port is published
# on 0.0.0.0. That is correct for a laptop and catastrophic on a host anybody
# else can reach.
#
# Production is `docker-compose.prod.yml`, where no secret has a default,
# authentication cannot be switched off by accident, and nothing binds beyond
# loopback. See docs/DEPLOYMENT.md. The two files are separate on purpose:
# a single file with a "prod" flag is one typo away from serving a real
# merchant's ledger to the internet.
# -----------------------------------------------------------------------------

[CmdletBinding()]
param(
    # Stop the containers and exit.
    [switch]$Stop,
    # Skip the image build. Faster when nothing in the services changed.
    [switch]$NoBuild,
    # Bring the stack up but do not start the console.
    [switch]$BackendOnly
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Write-Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "    ok   $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "    !    $text" -ForegroundColor Yellow }

function Stop-OnFailure($what) {
    # PowerShell 5.1 has no pipeline chain operators, so every external command
    # is checked explicitly. Without this the script marches on after a failed
    # build and reports success it did not achieve.
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nFAILED: $what (exit $LASTEXITCODE)" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

# ---------------------------------------------------------------------------

if ($Stop) {
    Write-Step "Stopping containers"
    docker compose --profile apps down
    Stop-OnFailure "docker compose down"
    Write-Ok "stopped. Data is kept; use 'docker compose --profile apps down -v' to delete it."
    exit 0
}

Write-Host ""
Write-Host "  Salvage -- development stack" -ForegroundColor White
Write-Host "  Unauthenticated by design. Do not run this on a shared host." -ForegroundColor DarkYellow
Write-Host "  Production: docker-compose.prod.yml, see docs/DEPLOYMENT.md" -ForegroundColor DarkGray

# ---------------------------------------------------------------------------
Write-Step "Checking Docker"

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nDocker is not reachable. Start Docker Desktop and try again." -ForegroundColor Red
    exit 1
}
Write-Ok "docker is running"

# ---------------------------------------------------------------------------
Write-Step "Starting infrastructure (PostgreSQL, Redis, Redpanda)"

docker compose up -d --wait postgres redis redpanda
Stop-OnFailure "starting infrastructure"
Write-Ok "postgres, redis, redpanda healthy"

# ---------------------------------------------------------------------------
Write-Step "Creating Kafka topics"

# Runs ops/redpanda/topics.sh, which is also what docker-compose.prod.yml runs.
# Topic names, partition counts and retention have one definition.
docker compose up --exit-code-from redpanda-init redpanda-init
Stop-OnFailure "creating topics"
Write-Ok "topics ready"

# ---------------------------------------------------------------------------
Write-Step "Starting salvage-core and salvage-brain"
Write-Host "    The first build compiles the Java service and takes a few minutes." -ForegroundColor DarkGray

if ($NoBuild) {
    docker compose --profile apps up -d --wait salvage-core salvage-brain
} else {
    docker compose --profile apps up -d --build --wait salvage-core salvage-brain
}
Stop-OnFailure "starting services"
Write-Ok "salvage-core and salvage-brain healthy"

# ---------------------------------------------------------------------------
Write-Step "Checking the read path"

# A container reporting healthy means its own probe passed. This asks the two
# endpoints the console actually reads, which is a different question and the
# one that decides whether the screens have anything on them.
$corePort  = if ($env:CORE_HOST_PORT)  { $env:CORE_HOST_PORT }  else { "8081" }
$brainPort = if ($env:BRAIN_HOST_PORT) { $env:BRAIN_HOST_PORT } else { "8001" }

$coreUrl  = "http://localhost:$corePort"
$brainUrl = "http://localhost:$brainPort"

try {
    Invoke-RestMethod -Uri "$coreUrl/health/readiness" -TimeoutSec 10 | Out-Null
    Write-Ok "salvage-core answering on $corePort"
} catch {
    Write-Warn "salvage-core is up but not answering on $corePort yet; it may still be migrating"
}

try {
    Invoke-RestMethod -Uri "$brainUrl/v1/sensing/rails" -TimeoutSec 10 | Out-Null
    Write-Ok "salvage-brain answering on $brainPort"
} catch {
    Write-Warn "salvage-brain is up but not answering on $brainPort yet"
}

# Is what answered on that port actually ours?
#
# Docker publishes a port only if it is free, but "free" is decided when the
# container starts and says nothing about what was already bound by a process
# outside this stack. If something else holds the port, docker compose reports
# the bind failure and every check above can still pass against the wrong
# server -- an unrelated API answering a correct 404 for paths it has never
# heard of, which the console renders as five screens of "nothing ingested".
#
# FastAPI publishes info.title, so ask.
function Test-Identity($url, $expected, $name) {
    try {
        $doc = Invoke-RestMethod -Uri "$url/openapi.json" -TimeoutSec 5
    } catch {
        return    # Cannot tell. Not evidence of anything.
    }
    if ($doc.info.title -and $doc.info.title -ne $expected) {
        Write-Host ""
        Write-Host "FAILED: $url is not $name." -ForegroundColor Red
        Write-Host "  Something else is listening there. It calls itself '$($doc.info.title)'." -ForegroundColor Red
        Write-Host "  Stop it, or pick another port:" -ForegroundColor Yellow
        Write-Host "    `$env:BRAIN_HOST_PORT = '8011'; .\start.ps1" -ForegroundColor Yellow
        exit 1
    }
}

Test-Identity $brainUrl "Salvage Brain" "salvage-brain"

if ($BackendOnly) {
    Write-Host "`nBackend is up. Console not started (-BackendOnly)." -ForegroundColor Green
    Write-Host "  core   http://localhost:$corePort"
    Write-Host "  brain  http://localhost:$brainPort"
    exit 0
}

# ---------------------------------------------------------------------------
Write-Step "Preparing the console"

Set-Location -Path (Join-Path $PSScriptRoot "apps\salvage-console")

if (-not (Test-Path "node_modules")) {
    Write-Host "    Installing dependencies (first run only)..." -ForegroundColor DarkGray
    npm ci
    Stop-OnFailure "npm ci"
}
Write-Ok "dependencies present"

Write-Host ""
Write-Host "  Everything is up." -ForegroundColor Green
Write-Host ""
Write-Host "  The console starts below. Open the URL it prints -- usually" -ForegroundColor White
Write-Host "  http://localhost:3000, or the next free port if 3000 is taken." -ForegroundColor White
Write-Host ""
Write-Host "  There will be no data until a payment fails. To create one:" -ForegroundColor White
Write-Host "  open the Checkout page and press 'Publish failure event'." -ForegroundColor White
Write-Host ""
Write-Host "  Ctrl-C stops the console. Containers keep running." -ForegroundColor DarkGray
Write-Host "  Stop them with: .\start.ps1 -Stop" -ForegroundColor DarkGray
Write-Host ""

# The console defaults to these, but only because they are the ports this file
# publishes. Setting them explicitly keeps the two in step when BRAIN_HOST_PORT
# or CORE_HOST_PORT is overridden, rather than leaving the console reading a
# port nothing is on.
$env:BRAIN_BASE_URL = $brainUrl
$env:CORE_BASE_URL  = $coreUrl

npm run dev
