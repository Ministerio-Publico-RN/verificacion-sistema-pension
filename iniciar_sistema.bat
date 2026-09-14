@echo off
cd /d "%~dp0"
title Sistema de Verificacion Previsional - MPFN
echo ======================================================================
echo    MINISTERIO PUBLICO - FISCALIA DE LA NACION
echo    Sistema de Verificacion Previsional de Trabajadores
echo ======================================================================
echo.
echo Comprobando y liberando puerto 8080...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

echo Iniciando servidor local en http://localhost:8080 ...
echo [MODO VISIBLE ACTIVO]: Veras la ventana de Chromium operando en tu pantalla.
echo.

start "" "http://localhost:8080"
python src\server.py 8080

pause
