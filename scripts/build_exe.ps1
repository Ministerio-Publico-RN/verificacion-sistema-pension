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

Write-Host "== 1/3 Compilando frontend ==" -ForegroundColor Cyan
Push-Location "$root/frontend"
npm ci
npm run build
Pop-Location

Write-Host "== 2/3 Instalando dependencias de Python para el build ==" -ForegroundColor Cyan
# --timeout/--retries mas altos: PyPI a veces corta la conexion a mitad de la
# descarga (ConnectionResetError); reintentar automaticamente suele bastar.
$pipArgs = @('--default-timeout=120', '--retries', '8')
python -m pip install --upgrade pip @pipArgs
python -m pip install @pipArgs -r "$root/requirements.txt"
python -m pip install @pipArgs pyinstaller

Write-Host "== 3/3 Empaquetando ejecutable con PyInstaller ==" -ForegroundColor Cyan
Push-Location $root
# Se invoca como modulo de Python (no como "pyinstaller" suelto) para que
# funcione aunque la carpeta Scripts de Python no este en el PATH.
python -m PyInstaller --noconfirm --clean `
  --name VerificacionPrevisional-MPFN `
  --onefile `
  --console `
  --add-data "web;web" `
  --add-data "docs;docs" `
  --collect-all playwright `
  --paths src `
  src/server.py
Pop-Location

Write-Host ""
Write-Host "Listo: dist/VerificacionPrevisional-MPFN.exe" -ForegroundColor Green
Write-Host "En el primer arranque descargara Chromium junto al .exe (requiere internet una unica vez)."
