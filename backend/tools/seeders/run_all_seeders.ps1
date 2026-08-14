$ErrorActionPreference = "Stop"

if (-not $env:ERP_BASE_URL) {
    $env:ERP_BASE_URL = "http://127.0.0.1:8000"
}

if (-not $env:ERP_ADMIN_EMAIL) {
    $env:ERP_ADMIN_EMAIL = Read-Host "ERP admin email"
}

if (-not $env:ERP_ADMIN_PASSWORD) {
    $securePassword = Read-Host "ERP admin password" -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        $env:ERP_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

if (-not $env:ERP_STATE_FILE) {
    $env:ERP_STATE_FILE = Join-Path $PSScriptRoot "seeding_state.json"
}

Set-Location $PSScriptRoot
python .\run_all_seeders.py
exit $LASTEXITCODE
