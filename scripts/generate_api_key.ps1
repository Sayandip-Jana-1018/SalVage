# Generate a Salvage API key and the configuration entry for it in PowerShell.
#
# The key is printed once, here, and never stored anywhere by this repository.
# What goes into configuration is its SHA-256 hash, so a leak of the configuration
# does not leak a usable credential.
#
# Usage:
#   .\scripts\generate_api_key.ps1 -Scope operator
#   .\scripts\generate_api_key.ps1 -Scope merchant -MerchantId merch_acme
#
# Both services read the same format, so one key works against salvage-core and
# salvage-brain. Append the printed entry to SALVAGE_API_KEYS on both.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("operator", "merchant")]
    [string]$Scope,

    [Parameter(Position = 1)]
    [string]$MerchantId = ""
)

$ErrorActionPreference = "Stop"

if ($Scope -eq "operator") {
    if ($MerchantId -ne "") {
        Write-Error "An operator key addresses every tenant. Do not bind it to one."
        exit 1
    }
    $targetTenant = "*"
} else {
    if ([string]::IsNullOrWhiteSpace($MerchantId)) {
        Write-Error "A merchant key requires a -MerchantId (e.g. .\scripts\generate_api_key.ps1 -Scope merchant -MerchantId merch_demo)"
        exit 1
    }
    $targetTenant = $MerchantId
}

# 32 bytes of CSPRNG output, base64url, no padding
$bytes = [byte[]]::new(32)
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)

# Base64url encoding (replace + with -, / with _, remove =)
$b64 = [Convert]::ToBase64String($bytes)
$secret = $b64.Replace("+", "-").Replace("/", "_").TrimEnd("=")

$key = "svg_${Scope}_${secret}"

# SHA-256 hash in lowercase hex
$sha = [System.Security.Cryptography.SHA256]::Create()
$keyBytes = [System.Text.Encoding]::UTF8.GetBytes($key)
$hashBytes = $sha.ComputeHash($keyBytes)
$hash = -join ($hashBytes | ForEach-Object { "{0:x2}" -f $_ })

Write-Host ""
Write-Host "  Key (shown once, store it in a password manager and hand it over securely):" -ForegroundColor Cyan
Write-Host ""
Write-Host "    $key" -ForegroundColor Green
Write-Host ""
Write-Host "  Configuration entry (append to SALVAGE_API_KEYS on salvage-core AND salvage-brain):" -ForegroundColor Cyan
Write-Host ""
Write-Host "    ${Scope}:${targetTenant}:${hash}" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Callers authenticate with:" -ForegroundColor Cyan
Write-Host ""
Write-Host "    Authorization: Bearer $key" -ForegroundColor White
Write-Host ""
Write-Host "  For the console, set:" -ForegroundColor Cyan
Write-Host ""
Write-Host "    SALVAGE_API_KEY=$key" -ForegroundColor Magenta
Write-Host ""
