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

CURRENT_VERSION = "1.0.14"
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
                return {'has_update': False, 'error': f"HTTP {resp.status}"}
            data = json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        return {'has_update': False, 'error': str(e)}

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
        'latest_version': latest_tag.lstrip('vV'),
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


def finalize_and_exit():
    """
    Ejecuta el script de reemplazo del ejecutable tras el cierre del programa y termina el proceso actual.
    """
    if not is_frozen():
        return {'success': False, 'message': 'Solo disponible en ejecutable compilado.'}

    exe_path = os.path.abspath(sys.executable)
    exe_dir = os.path.dirname(exe_path)
    exe_name = os.path.basename(exe_path)
    temp_new_exe = os.path.join(exe_dir, f"{exe_name}.update")

    if not os.path.exists(temp_new_exe):
        return {'success': False, 'message': 'No se encontró el archivo de actualización descargado.'}

    safe_exe_path = exe_path.replace("'", "''")
    safe_temp_exe = temp_new_exe.replace("'", "''")
    log_path = os.path.join(exe_dir, "updater.log").replace("'", "''")
    ps1_path = os.path.join(exe_dir, "_updater_swap.ps1")

    ps1_content = f"""# Script de reemplazo post-cierre MPFN
$ErrorActionPreference = 'SilentlyContinue'
$log = '{log_path}'

function Log-Msg($msg) {{
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    "[$ts] $msg" | Out-File -FilePath $log -Append -Encoding utf8
}}

Log-Msg "Iniciando reemplazo de archivo tras cierre de la aplicacion..."
Start-Sleep -Seconds 1

$attempts = 0
while ($attempts -lt 30) {{
    $attempts++
    try {{
        if (Test-Path '{safe_exe_path}') {{
            Remove-Item -Path '{safe_exe_path}' -Force -ErrorAction Stop
        }}
        Log-Msg "Ejecutable anterior eliminado."
        break
    }} catch {{
        Start-Sleep -Seconds 1
    }}
}}

try {{
    Move-Item -Path '{safe_temp_exe}' -Destination '{safe_exe_path}' -Force -ErrorAction Stop
    Log-Msg "Actualizacion completada exitosamente en {safe_exe_path}."
}} catch {{
    Log-Msg "Error al mover archivo: $_"
}}

Remove-Item -Path $PSCommandPath -Force -ErrorAction SilentlyContinue
"""

    try:
        with open(ps1_path, 'w', encoding='utf-8') as f:
            f.write(ps1_content)
    except Exception as e:
        return {'success': False, 'message': f"Error al preparar script: {e}"}

    try:
        flags = 0
        if hasattr(subprocess, 'CREATE_NEW_PROCESS_GROUP'):
            flags |= subprocess.CREATE_NEW_PROCESS_GROUP

        subprocess.Popen(
            [
                'powershell.exe',
                '-NoProfile',
                '-ExecutionPolicy', 'Bypass',
                '-WindowStyle', 'Hidden',
                '-File', ps1_path
            ],
            cwd=exe_dir,
            creationflags=flags
        )

        def _delayed_exit():
            time.sleep(0.8)
            os._exit(0)

        threading.Thread(target=_delayed_exit, daemon=True).start()

        return {
            'success': True,
            'message': 'Cerrando aplicación y aplicando actualización.'
        }
    except Exception as e:
        return {'success': False, 'message': f"Error al ejecutar finalizador: {e}"}
