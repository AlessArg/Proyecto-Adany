$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\..\frontend"

if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias frontend..."
    npm install
}

npm run dev
