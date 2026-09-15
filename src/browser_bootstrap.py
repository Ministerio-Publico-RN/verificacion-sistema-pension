"""
Prepara el navegador de Playwright antes de que arranque el servidor.

En el .exe empaquetado (PyInstaller) no existe un entorno pip/venv donde Playwright
ya tenga Chromium descargado, así que en el primer arranque:
  1. Redirige la carpeta de navegadores de Playwright a una ubicación fija junto al
     .exe (en vez del caché del usuario), para que el navegador quede autocontenido
     y portable junto a la app.
  2. Si Chromium no está ahí todavía, lo descarga una única vez (requiere internet
     solo esa primera vez). Las siguientes ejecuciones son 100% offline.

En modo desarrollo (python src/server.py) no se toca nada: se respeta la instalación
de Playwright que ya tenga el entorno (`pip install playwright && playwright install
chromium`), igual que antes de empaquetar.

Debe importarse ANTES que sbs_service (que hace `from playwright.sync_api import
sync_playwright`), porque Playwright resuelve la variable de entorno al importarse.
"""
import os
import runpy
import sys

from paths import data_path, is_frozen

BROWSERS_DIR = data_path('browsers')


def _chromium_already_installed():
    if not os.path.isdir(BROWSERS_DIR):
        return False
    # Playwright crea una carpeta tipo "chromium-1234" dentro de PLAYWRIGHT_BROWSERS_PATH
    return any(name.startswith('chromium') for name in os.listdir(BROWSERS_DIR))


def ensure_chromium_installed(on_progress=None):
    """Descarga Chromium para Playwright si aún no está presente. Bloqueante."""
    if _chromium_already_installed():
        return True

    if on_progress:
        on_progress('Descargando Chromium para la verificación SBS (solo la primera vez, requiere internet)...')

    os.makedirs(BROWSERS_DIR, exist_ok=True)

    old_argv = sys.argv
    try:
        sys.argv = ['playwright', 'install', 'chromium']
        try:
            runpy.run_module('playwright', run_name='__main__', alter_sys=True)
        except SystemExit as exc:
            if exc.code not in (0, None):
                raise RuntimeError(f'playwright install terminó con código {exc.code}')
    finally:
        sys.argv = old_argv

    ok = _chromium_already_installed()
    if on_progress:
        on_progress('Chromium listo.' if ok else 'No se pudo descargar Chromium: revise su conexión a internet.')
    return ok


if is_frozen():
    # Solo en el .exe empaquetado: Chromium vive junto al ejecutable en vez del
    # caché de usuario de una instalación pip normal, para que sea portable.
    os.environ['PLAYWRIGHT_BROWSERS_PATH'] = BROWSERS_DIR
    ensure_chromium_installed(on_progress=print)
