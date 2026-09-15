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
python -m pip install --upgrade pip
python -m pip install -r "$root/requirements.txt" pyinstaller

Write-Host "== 3/3 Empaquetando ejecutable con PyInstaller ==" -ForegroundColor Cyan
Push-Location $root
pyinstaller --noconfirm --clean `
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
