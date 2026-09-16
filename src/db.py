"""
Persistencia simple en SQLite para el historial de ejecuciones de verificación
y la reanudación de corridas interrumpidas (ej. al recargar la página a mitad
de una verificación larga de la PEA).
"""
import os
import json
import sqlite3
import threading
from datetime import datetime

from paths import data_path

DATA_DIR = data_path('data')
DB_PATH = os.path.join(DATA_DIR, 'verificacion.db')

_lock = threading.Lock()
_conn = None


def _get_conn():
    global _conn
    if _conn is None:
        os.makedirs(DATA_DIR, exist_ok=True)
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.execute('PRAGMA journal_mode=WAL')
        _conn.row_factory = sqlite3.Row
    return _conn


def init_db():
    with _lock:
        conn = _get_conn()
        conn.execute('''
            CREATE TABLE IF NOT EXISTS executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,
                estado TEXT NOT NULL,
                fecha_inicio TEXT NOT NULL,
                fecha_actualizacion TEXT NOT NULL,
                total INTEGER NOT NULL DEFAULT 0,
                archivos_json TEXT NOT NULL DEFAULT '[]'
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS execution_workers (
                execution_id INTEGER NOT NULL,
                dni TEXT NOT NULL,
                data_json TEXT NOT NULL,
                sbs_consultado INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (execution_id, dni)
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_execw_execution ON execution_workers(execution_id)')
        conn.commit()


def _now():
    return datetime.now().isoformat(timespec='seconds')


def create_execution(tipo, archivos, workers):
    """Crea una ejecución nueva y guarda el padrón inicial de trabajadores. Devuelve el id."""
    with _lock:
        conn = _get_conn()
        cur = conn.execute(
            'INSERT INTO executions (tipo, estado, fecha_inicio, fecha_actualizacion, total, archivos_json) VALUES (?, ?, ?, ?, ?, ?)',
            (tipo, 'en_curso', _now(), _now(), len(workers), json.dumps(archivos, ensure_ascii=False))
        )
        execution_id = cur.lastrowid
        rows = [
            (execution_id, w.get('dni', ''), json.dumps(w, ensure_ascii=False), 1 if w.get('sbs_consultado') else 0)
            for w in workers if w.get('dni')
        ]
        conn.executemany(
            'INSERT OR REPLACE INTO execution_workers (execution_id, dni, data_json, sbs_consultado) VALUES (?, ?, ?, ?)',
            rows
        )
        conn.commit()
        return execution_id


def list_executions():
    with _lock:
        conn = _get_conn()
        rows = conn.execute('SELECT * FROM executions ORDER BY id DESC').fetchall()
        result = []
        for row in rows:
            # Cuenta solo resultados reales: una consulta CANCELADA (detenida a mitad de
            # camino) queda marcada sbs_consultado=1 en datos antiguos, pero no es un
            # resultado válido y no debe contarse como avance.
            marked_rows = conn.execute(
                'SELECT data_json FROM execution_workers WHERE execution_id = ? AND sbs_consultado = 1',
                (row['id'],)
            ).fetchall()
            consultados = 0
            for wr in marked_rows:
                try:
                    data = json.loads(wr['data_json'])
                    if (data.get('sbs_resultado') or {}).get('estado_sbs') != 'CANCELADO':
                        consultados += 1
                except Exception:
                    consultados += 1
            result.append({
                'id': row['id'],
                'tipo': row['tipo'],
                'estado': row['estado'],
                'fecha_inicio': row['fecha_inicio'],
                'fecha_actualizacion': row['fecha_actualizacion'],
                'total': row['total'],
                'consultados': consultados,
                'archivos': json.loads(row['archivos_json'])
            })
        return result


def get_execution(execution_id):
    with _lock:
        conn = _get_conn()
        row = conn.execute('SELECT * FROM executions WHERE id = ?', (execution_id,)).fetchone()
        if not row:
            return None
        worker_rows = conn.execute(
            'SELECT data_json FROM execution_workers WHERE execution_id = ? ORDER BY rowid',
            (execution_id,)
        ).fetchall()
        workers = [json.loads(r['data_json']) for r in worker_rows]
        return {
            'id': row['id'],
            'tipo': row['tipo'],
            'estado': row['estado'],
            'fecha_inicio': row['fecha_inicio'],
            'fecha_actualizacion': row['fecha_actualizacion'],
            'total': row['total'],
            'archivos': json.loads(row['archivos_json']),
            'workers': workers
        }


def merge_worker(execution_id, dni, partial_data):
    """Actualiza (merge) los datos de un trabajador ya guardado, ej. tras una consulta SBS.

    Usa UPDATE (no INSERT OR REPLACE) cuando la fila ya existe: REPLACE borra e inserta de
    nuevo la fila, lo que le asigna un rowid mayor y la manda al final de "ORDER BY rowid" en
    get_execution(). Eso hacía que, en una ejecución EN CURSO, los trabajadores ya verificados
    se reordenaran al final de la lista en vez de mantener su posición original del padrón,
    dando la falsa impresión de que "todos" seguían Sin verificar en las primeras páginas.
    """
    with _lock:
        conn = _get_conn()
        row = conn.execute(
            'SELECT data_json FROM execution_workers WHERE execution_id = ? AND dni = ?',
            (execution_id, dni)
        ).fetchone()
        if row:
            data = json.loads(row['data_json'])
            data.update(partial_data)
            sbs_consultado = 1 if data.get('sbs_consultado') else 0
            conn.execute(
                'UPDATE execution_workers SET data_json = ?, sbs_consultado = ? WHERE execution_id = ? AND dni = ?',
                (json.dumps(data, ensure_ascii=False), sbs_consultado, execution_id, dni)
            )
        else:
            data = {'dni': dni}
            data.update(partial_data)
            sbs_consultado = 1 if data.get('sbs_consultado') else 0
            conn.execute(
                'INSERT INTO execution_workers (execution_id, dni, data_json, sbs_consultado) VALUES (?, ?, ?, ?)',
                (execution_id, dni, json.dumps(data, ensure_ascii=False), sbs_consultado)
            )
        conn.execute('UPDATE executions SET fecha_actualizacion = ? WHERE id = ?', (_now(), execution_id))
        conn.commit()


def update_status(execution_id, estado):
    with _lock:
        conn = _get_conn()
        conn.execute(
            'UPDATE executions SET estado = ?, fecha_actualizacion = ? WHERE id = ?',
            (estado, _now(), execution_id)
        )
        conn.commit()


def delete_execution(execution_id):
    with _lock:
        conn = _get_conn()
        conn.execute('DELETE FROM execution_workers WHERE execution_id = ?', (execution_id,))
        conn.execute('DELETE FROM executions WHERE id = ?', (execution_id,))
        conn.commit()
