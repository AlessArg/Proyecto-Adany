$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\..\frontend"

if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias frontend..."
    npm install
}

npm run build
if ($LASTEXITCODE -ne 0) {
    throw "Fallo al generar build de frontend"
}

npm run preview -- --host 0.0.0.0 --port 4173
