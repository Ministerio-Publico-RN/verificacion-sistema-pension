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

CURRENT_VERSION = "1.0.0"
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
    Consulta la API de GitHub Releases para verificar si existe una versión superior a la actual.
    """
    url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'MPFN-Verificacion-Previsional-Updater',
            'Accept': 'application/vnd.github.v3+json'
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status != 200:
                return {
                    'has_update': False,
                    'current_version': CURRENT_VERSION,
                    'message': f"Servidor de GitHub respondió con código {resp.status}."
                }
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {
                'has_update': False,
                'current_version': CURRENT_VERSION,
                'latest_version': CURRENT_VERSION,
                'message': 'No hay nuevas versiones publicadas en GitHub actualmente.'
            }
        return {
            'has_update': False,
            'current_version': CURRENT_VERSION,
            'message': f"Error de conexión con GitHub (HTTP {e.code})."
        }
    except Exception as e:
        return {
            'has_update': False,
            'current_version': CURRENT_VERSION,
            'message': f"No se pudo comprobar actualizaciones: {str(e)}"
        }

    tag_name = data.get('tag_name', '')
    latest_ver = parse_version(tag_name)
    current_ver = parse_version(CURRENT_VERSION)

    has_update = latest_ver > current_ver

    # Buscar el ejecutable en los assets
    exe_asset = None
    for asset in data.get('assets', []):
        name = asset.get('name', '').lower()
        if name.endswith('.exe'):
            exe_asset = asset
            break

    download_url = exe_asset.get('browser_download_url') if exe_asset else None
    size_mb = round(exe_asset.get('size', 0) / (1024 * 1024), 2) if exe_asset else 0

    return {
        'has_update': has_update,
        'current_version': CURRENT_VERSION,
        'latest_version': tag_name.lstrip('vV'),
        'release_name': data.get('name') or tag_name,
        'release_notes': data.get('body', ''),
        'download_url': download_url,
        'asset_name': exe_asset.get('name') if exe_asset else None,
        'size_mb': size_mb,
        'published_at': data.get('published_at', ''),
        'html_url': data.get('html_url', f"https://github.com/{GITHUB_REPO}/releases")
    }


def apply_update(download_url=None):
    """
    Descarga la nueva versión del .exe y ejecuta el script de reemplazo y reinicio automático.
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
    bat_path = os.path.join(exe_dir, "_updater_swap.bat")

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

    bat_content = f"""@echo off
chcp 65001 > nul
echo Aplicando actualizacion de Verificacion Previsional MPFN...
timeout /t 2 /nobreak > nul

:wait_loop
taskkill /F /IM "{exe_name}" > nul 2>&1
del "{exe_path}" > nul 2>&1
if exist "{exe_path}" (
    timeout /t 1 /nobreak > nul
    goto wait_loop
)

move /y "{temp_new_exe}" "{exe_path}" > nul
start "" "{exe_path}"
del "%~f0"
"""

    try:
        with open(bat_path, 'w', encoding='utf-8') as f:
            f.write(bat_content)
    except Exception as e:
        return {'success': False, 'message': f"Error al preparar script de actualización: {e}"}

    try:
        flags = 0
        if hasattr(subprocess, 'DETACHED_PROCESS'):
            flags |= subprocess.DETACHED_PROCESS
        if hasattr(subprocess, 'CREATE_NO_WINDOW'):
            flags |= subprocess.CREATE_NO_WINDOW

        subprocess.Popen(
            ['cmd.exe', '/c', bat_path],
            creationflags=flags,
            close_fds=True
        )

        def _delayed_exit():
            time.sleep(1.5)
            os._exit(0)

        threading.Thread(target=_delayed_exit, daemon=True).start()

        return {
            'success': True,
            'message': 'Actualización descargada con éxito. El sistema se reiniciará automáticamente en unos segundos.'
        }
    except Exception as e:
        return {'success': False, 'message': f"Error al ejecutar actualizador: {e}"}
