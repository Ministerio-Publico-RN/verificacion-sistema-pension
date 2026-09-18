# Compila el frontend y empaqueta el backend + frontend en un unico .exe portable
# (Windows) usando PyInstaller. Chromium NO se incluye en el .exe: se descarga una
# sola vez, la primera vez que se ejecuta el programa (ver src/browser_bootstrap.py).
#
# Uso local:
#   powershell -ExecutionPolicy Bypass -File scripts/build_exe.ps1
#
# Resultado: dist/VerificacionPrevisional-MPFN.exe

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exePath = Join-Path $root "dist/VerificacionPrevisional-MPFN.exe"

# Cerrar instancias previas si están abiertas para evitar PermissionError al sobrescribir el .exe
Get-Process -Name "VerificacionPrevisional-MPFN*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# $ErrorActionPreference = "Stop" NO detiene el script si un programa externo
# (npm, python, pyinstaller) termina con codigo de salida distinto de 0 -- solo
# afecta errores de PowerShell. Por eso cada paso externo se valida a mano con
# esta funcion; sin esto, un paso que falla a mitad de camino (ej. sin internet)
# deja el script avisando "Listo" sin haber generado nada.
function Invoke-Step {
    param(
        [Parameter(Mandatory)][string]$Description,
        [Parameter(Mandatory)][scriptblock]$Action
    )
    Write-Host $Description -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo en: $Description (codigo de salida $LASTEXITCODE). Revisa el log de arriba -- el build se detiene aqui, no continua a los pasos siguientes."
    }
}

Push-Location "$root/frontend"
try {
    if (-not (Test-Path "node_modules/.bin/vite.cmd") -and -not (Test-Path "node_modules/vite")) {
        Invoke-Step "== 1/3 Instalando dependencias de frontend (npm install) ==" { npm install }
    }
    Invoke-Step "== 1/3 Compilando frontend (npm run build) ==" { npm run build }
} finally {
    Pop-Location
}

Write-Host "== 2/3 Instalando dependencias de Python para el build ==" -ForegroundColor Cyan
# --timeout/--retries mas altos: PyPI a veces corta la conexion a mitad de la
# descarga (ConnectionResetError); reintentar automaticamente suele bastar. Si
# falla siempre (no solo alguna vez), es un bloqueo de red/antivirus, no algo
# que reintentar arregle -- ver el mensaje de error al final del script.
$pipArgs = @('--default-timeout=120', '--retries', '8')
Invoke-Step "  - Actualizando pip" { python -m pip install --upgrade pip @pipArgs }
Invoke-Step "  - Instalando requirements.txt (playwright, openpyxl)" { python -m pip install @pipArgs -r "$root/requirements.txt" }
Invoke-Step "  - Instalando pyinstaller" { python -m pip install @pipArgs pyinstaller }

Push-Location $root
try {
    # Se invoca como modulo de Python (no como "pyinstaller" suelto) para que
    # funcione aunque la carpeta Scripts de Python no este en el PATH.
    Invoke-Step "== 3/3 Empaquetando ejecutable con PyInstaller ==" {
        python -m PyInstaller --noconfirm --clean `
            --name VerificacionPrevisional-MPFN `
            --onefile `
            --console `
            --add-data "web;web" `
            --add-data "docs;docs" `
            --add-data "src/populate_afiliacion.ps1;src" `
            --add-data "src/ubigeos_afpnet.json;src" `
            --collect-all playwright `
            --paths src `
            src/server.py
    }
} finally {
    Pop-Location
}

if (-not (Test-Path $exePath)) {
    throw "PyInstaller no reporto error pero '$exePath' no existe. Revisa el log de PyInstaller arriba."
}

$sizeMB = [Math]::Round((Get-Item $exePath).Length / 1MB, 1)
Write-Host ""
Write-Host "Listo: $exePath ($sizeMB MB)" -ForegroundColor Green
Write-Host "En el primer arranque descargara Chromium junto al .exe (requiere internet una unica vez)."
