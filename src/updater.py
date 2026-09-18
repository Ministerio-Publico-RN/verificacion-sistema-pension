"""
Módulo de Actualización Automática para Verificación Previsional (MPFN)
Permite consultar GitHub Releases para detectar nuevas versiones y reemplazar
de forma atómica y desatendida el ejecutable .exe en Windows.
"""
import os
import sys
import json
import time
import re
import urllib.request
import urllib.error
import subprocess
import threading
from paths import is_frozen

CURRENT_VERSION = "1.0.18"
GITHUB_REPO = "Ministerio-Publico-RN/verificacion-sistema-pension"


def parse_version(v_str):
    """Convierte un string de versión (ej: 'v1.2.3' o '1.0.0') a tupla de enteros."""
    if not v_str:
        return (0, 0, 0)
    cleaned = re.sub(r'^[vV]', '', str(v_str).strip())
    parts = []
    for p in cleaned.split('.'):
        num = re.sub(r'\D', '', p)
        parts.append(int(num) if num else 0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts[:3])


def check_for_updates():
    """
    Consulta la API de GitHub Releases para obtener la última versión disponible.
    Compara con CURRENT_VERSION.
    """
    url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
    headers = {
        'User-Agent': 'MPFN-Verificacion-Previsional-Updater',
        'Accept': 'application/vnd.github.v3+json'
    }

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status != 200:
                return {
                    'has_update': False,
                    'current_version': CURRENT_VERSION,
                    'latest_version': CURRENT_VERSION,
                    'error': f"HTTP {resp.status}"
                }
            data = json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        return {
            'has_update': False,
            'current_version': CURRENT_VERSION,
            'latest_version': CURRENT_VERSION,
            'error': str(e)
        }

    latest_tag = data.get('tag_name', '')
    latest_version = parse_version(latest_tag)
    curr_version = parse_version(CURRENT_VERSION)

    has_update = latest_version > curr_version

    exe_asset = None
    assets = data.get('assets', [])
    for asset in assets:
        name = asset.get('name', '')
        if name.endswith('.exe'):
            exe_asset = asset
            break

    download_url = exe_asset.get('browser_download_url') if exe_asset else None
    size_mb = round(exe_asset.get('size', 0) / (1024 * 1024), 1) if exe_asset else 0

    return {
        'has_update': has_update,
        'current_version': CURRENT_VERSION,
        'latest_version': latest_tag.lstrip('vV') or CURRENT_VERSION,
        'release_name': data.get('name', latest_tag),
        'release_notes': data.get('body', ''),
        'download_url': download_url,
        'asset_name': exe_asset.get('name') if exe_asset else None,
        'size_mb': size_mb,
        'published_at': data.get('published_at', ''),
        'html_url': data.get('html_url', f"https://github.com/{GITHUB_REPO}/releases")
    }


def apply_update(download_url=None):
    """
    Descarga la nueva versión del .exe a un archivo temporal (.update) y lo valida.
    No mata el proceso inmediatamente para permitir que el usuario vea la confirmación.
    """
    if not is_frozen():
        return {
            'success': False,
            'message': 'La actualización automática solo está disponible ejecutando la aplicación desde el archivo .exe compilado. En entorno de desarrollo utilice git pull.'
        }

    if not download_url:
        check_res = check_for_updates()
        download_url = check_res.get('download_url')
        if not download_url:
            return {
                'success': False,
                'message': 'No se encontró un archivo .exe en el último release de GitHub para descargar.'
            }

    exe_path = os.path.abspath(sys.executable)
    exe_dir = os.path.dirname(exe_path)
    exe_name = os.path.basename(exe_path)
    temp_new_exe = os.path.join(exe_dir, f"{exe_name}.update")

    try:
        req = urllib.request.Request(
            download_url,
            headers={'User-Agent': 'MPFN-Verificacion-Previsional-Updater'}
        )
        with urllib.request.urlopen(req, timeout=180) as resp, open(temp_new_exe, 'wb') as out_file:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                out_file.write(chunk)
    except Exception as e:
        if os.path.exists(temp_new_exe):
            try:
                os.remove(temp_new_exe)
            except Exception:
                pass
        return {
            'success': False,
            'message': f"Error al descargar la actualización: {str(e)}"
        }

    try:
        downloaded_size = os.path.getsize(temp_new_exe)
        if downloaded_size < 5 * 1024 * 1024:
            os.remove(temp_new_exe)
            return {
                'success': False,
                'message': 'El archivo descargado está incompleto o dañado.'
            }
    except Exception as e:
        return {'success': False, 'message': f"Error al validar archivo descargado: {e}"}

    return {
        'success': True,
        'message': 'Actualización descargada con éxito. Listo para aplicar y reiniciar.'
    }


def check_and_apply_pending_update_on_startup():
    """
    Verifica al inicio del programa si existe un archivo de actualización pendiente (.exe.update).
    Si existe y es válido, ejecuta un proceso detached para reemplazar el ejecutable actual y
    relanzar la nueva versión, cerrando este proceso inmediatamente.
    """
    if not is_frozen():
        return False

    exe_path = os.path.abspath(sys.executable)
    exe_dir = os.path.dirname(exe_path)
    exe_name = os.path.basename(exe_path)
    temp_new_exe = os.path.join(exe_dir, f"{exe_name}.update")

    if not os.path.exists(temp_new_exe):
        return False

    try:
        if os.path.getsize(temp_new_exe) < 5 * 1024 * 1024:
            try:
                os.remove(temp_new_exe)
            except Exception:
                pass
            return False
    except Exception:
        return False

    print("===========================================================")
    print(" [ACTUALIZACIÓN PENDIENTE DETECTADA]")
    print(" Se encontró una versión descargada lista para instalar.")
    print(" Aplicando actualización y reiniciando el sistema...")
    print("===========================================================")

    bat_path = os.path.join(exe_dir, "_startup_swap.bat")
    log_path = os.path.join(exe_dir, "updater.log")

    bat_content = """@echo off
set "EXE=%~1"
set "UPDATE=%~2"
set "LOG=%~3"

echo [%date% %time%] [STARTUP] Reemplazando por actualizacion pendiente... >> "%LOG%"
ping 127.0.0.1 -n 3 >nul

set attempts=0
:loop_del
del /f /q "%EXE%" >nul 2>&1
if not exist "%EXE%" goto do_move
set /a attempts+=1
if %attempts% geq 15 goto do_taskkill
ping 127.0.0.1 -n 2 >nul
goto loop_del

:do_taskkill
taskkill /f /im "%~nx1" >nul 2>&1
ping 127.0.0.1 -n 2 >nul
del /f /q "%EXE%" >nul 2>&1

:do_move
if exist "%UPDATE%" (
    move /y "%UPDATE%" "%EXE%" >> "%LOG%" 2>&1
    echo [%date% %time%] [STARTUP] Actualizacion completada con exito. >> "%LOG%"
    start "" "%EXE%"
) else (
    echo [%date% %time%] [STARTUP] Error: Archivo %UPDATE% no encontrado. >> "%LOG%"
)

(goto) 2>nul & del "%~f0"
"""

    try:
        with open(bat_path, 'w', encoding='latin-1', errors='replace') as f:
            f.write(bat_content)

        comspec = os.environ.get('COMSPEC', r'C:\Windows\System32\cmd.exe')
        flags = 0
        if hasattr(subprocess, 'CREATE_NEW_PROCESS_GROUP'):
            flags |= subprocess.CREATE_NEW_PROCESS_GROUP
        if hasattr(subprocess, 'DETACHED_PROCESS'):
            flags |= subprocess.DETACHED_PROCESS
        if hasattr(subprocess, 'CREATE_NO_WINDOW'):
            flags |= subprocess.CREATE_NO_WINDOW

        subprocess.Popen(
            [comspec, '/c', bat_path, exe_path, temp_new_exe, log_path],
            cwd=exe_dir,
            creationflags=flags,
            close_fds=True
        )

        time.sleep(0.3)
        os._exit(0)
    except Exception as e:
        sys.stderr.write(f"[UPDATER] Error en startup auto-swap: {e}\n")
        return False


def finalize_and_exit(relaunch=False):
    """
    Aplica el reemplazo del ejecutable descargado (.update -> .exe) y cierra la aplicación.
    Si relaunch es True, vuelve a abrir la aplicación automáticamente tras aplicar los cambios.
    """
    if not is_frozen():
        return {'success': False, 'message': 'Solo disponible en ejecutable compilado.'}

    exe_path = os.path.abspath(sys.executable)
    exe_dir = os.path.dirname(exe_path)
    exe_name = os.path.basename(exe_path)
    temp_new_exe = os.path.join(exe_dir, f"{exe_name}.update")

    if not os.path.exists(temp_new_exe):
        return {'success': False, 'message': 'No se encontró el archivo de actualización descargado.'}

    bat_path = os.path.join(exe_dir, "_updater_swap.bat")
    log_path = os.path.join(exe_dir, "updater.log")
    relaunch_flag = "1" if relaunch else "0"

    bat_content = """@echo off
set "EXE=%~1"
set "UPDATE=%~2"
set "LOG=%~3"
set "RELAUNCH=%~4"

echo [%date% %time%] [UPDATER] Iniciando actualizacion de %EXE%... >> "%LOG%"
ping 127.0.0.1 -n 3 >nul

set attempts=0
:loop_del
del /f /q "%EXE%" >nul 2>&1
if not exist "%EXE%" goto do_move
set /a attempts+=1
if %attempts% geq 15 goto do_taskkill
ping 127.0.0.1 -n 2 >nul
goto loop_del

:do_taskkill
taskkill /f /im "%~nx1" >nul 2>&1
ping 127.0.0.1 -n 2 >nul
del /f /q "%EXE%" >nul 2>&1

:do_move
if exist "%UPDATE%" (
    move /y "%UPDATE%" "%EXE%" >> "%LOG%" 2>&1
    echo [%date% %time%] [UPDATER] Reemplazo completado exitosamente. >> "%LOG%"
    if "%RELAUNCH%"=="1" (
        start "" "%EXE%"
    )
) else (
    echo [%date% %time%] [UPDATER] Error: Archivo %UPDATE% no existe. >> "%LOG%"
)

(goto) 2>nul & del "%~f0"
"""

    try:
        with open(bat_path, 'w', encoding='latin-1', errors='replace') as f:
            f.write(bat_content)

        comspec = os.environ.get('COMSPEC', r'C:\Windows\System32\cmd.exe')
        flags = 0
        if hasattr(subprocess, 'CREATE_NEW_PROCESS_GROUP'):
            flags |= subprocess.CREATE_NEW_PROCESS_GROUP
        if hasattr(subprocess, 'DETACHED_PROCESS'):
            flags |= subprocess.DETACHED_PROCESS
        if hasattr(subprocess, 'CREATE_NO_WINDOW'):
            flags |= subprocess.CREATE_NO_WINDOW

        subprocess.Popen(
            [comspec, '/c', bat_path, exe_path, temp_new_exe, log_path, relaunch_flag],
            cwd=exe_dir,
            creationflags=flags,
            close_fds=True
        )
    except Exception as e:
        sys.stderr.write(f"[UPDATER] Error al spawnear helper batch: {e}\n")

    # SIEMPRE ejecutar salida retardada para garantizar que el proceso y terminal se cierren
    def _delayed_exit():
        time.sleep(0.4)
        os._exit(0)

    threading.Thread(target=_delayed_exit, daemon=True).start()

    return {
        'success': True,
        'message': 'Actualización en curso. La aplicación se cerrará.'
    }

