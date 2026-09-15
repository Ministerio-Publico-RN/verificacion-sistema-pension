"""
Resolución de rutas compatible con ejecución normal (python src/server.py) y con
el ejecutable empaquetado por PyInstaller (--onefile), donde __file__ apunta a una
carpeta temporal que se borra al cerrar el programa.

- resource_path: archivos de solo lectura empaquetados con la app (frontend, docs,
  archivos de muestra). En el .exe viven dentro del bundle temporal (sys._MEIPASS).
- data_path: archivos de lectura/escritura que deben persistir entre ejecuciones
  (base de datos, configuración, uploads). Siempre viven junto al .exe / al proyecto,
  nunca dentro del bundle temporal.
"""
import os
import sys

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def is_frozen():
    return bool(getattr(sys, 'frozen', False))


def resource_path(*parts):
    if is_frozen():
        base = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    else:
        base = _PROJECT_ROOT
    return os.path.join(base, *parts)


def data_path(*parts):
    base = os.path.dirname(sys.executable) if is_frozen() else _PROJECT_ROOT
    return os.path.join(base, *parts)
