$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\..\backend"

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable,
        [Parameter(Mandatory = $true)]
        [string[]]$Args,
        [Parameter(Mandatory = $true)]
        [string]$ErrorMessage
    )

    & $Executable @Args
    if ($LASTEXITCODE -ne 0) {
        throw "$ErrorMessage (codigo $LASTEXITCODE)"
    }
}

function New-BackendVenv {
    Write-Host "Creando entorno virtual en backend/.venv ..."
    if (Get-Command py -ErrorAction SilentlyContinue) {
        py -3 -m venv .venv
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        python -m venv .venv
    }
    else {
        throw "No se encontro Python en PATH. Instala Python 3.11+ y vuelve a intentar."
    }
}

$venvPython = Join-Path ".venv" "Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    New-BackendVenv
}
else {
    & $venvPython -c "import sys" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "El entorno virtual actual no es valido en este equipo. Recreando..."
        Remove-Item -Recurse -Force .venv
        New-BackendVenv
    }
}

Invoke-CheckedCommand -Executable $venvPython -Args @("-m", "pip", "install", "-r", "requirements.txt") -ErrorMessage "Fallo al instalar dependencias"
Invoke-CheckedCommand -Executable $venvPython -Args @("-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000") -ErrorMessage "Fallo al iniciar backend en produccion"
