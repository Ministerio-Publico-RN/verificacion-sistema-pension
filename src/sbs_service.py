"""
Servicio Conector Oficial para la SBS (Superintendencia de Banca y Seguros)
Utiliza un Pool de Worker Threads dedicados para Playwright con BrowserContexts
aislados, garantizando scraping paralelo estable, eliminación instantánea de
cookies ante retos de Imperva y cierre inmediato de ventanas.
"""
import time
import re
import queue
import threading
from playwright.sync_api import sync_playwright

SBS_URL = "https://servicios.sbs.gob.pe/ReporteSituacionPrevisional/Afil_Consulta.aspx"

# Posiciones de ventana en mosaico según worker_id
WINDOW_POSITIONS = [
    {"x": 60, "y": 60, "width": 880, "height": 680},
    {"x": 600, "y": 60, "width": 880, "height": 680},
    {"x": 300, "y": 320, "width": 880, "height": 680}
]

class SBSWorkerThread(threading.Thread):
    def __init__(self, worker_id, task_queue, manager=None):
        super().__init__(daemon=True)
        self.worker_id = worker_id
        self.task_queue = task_queue
        self.manager = manager
        self.running = True
        self.interrupted = False
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.is_ready = False

    def get_headless(self):
        if self.manager and hasattr(self.manager, 'headless'):
            return bool(self.manager.headless)
        return False

    def init_browser(self, headless=None):
        try:
            if headless is None:
                headless = self.get_headless()

            if not self.playwright:
                self.playwright = sync_playwright().start()
            
            pos = WINDOW_POSITIONS[self.worker_id % len(WINDOW_POSITIONS)]
            win_args = [
                f"--window-position={pos['x']},{pos['y']}",
                f"--window-size={pos['width']},{pos['height']}"
            ]

            if not self.browser or not self.browser.is_connected():
                self.browser = self.playwright.chromium.launch(
                    headless=headless,
                    slow_mo=50 if not headless else 0,
                    args=win_args
                )

            # Cada worker tiene su propio BrowserContext aislado (cookie jar propio)
            self.context = self.browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                viewport={"width": pos['width'] - 40, "height": pos['height'] - 80}
            )
            self.page = self.context.new_page()
            self.page.goto(SBS_URL, wait_until="domcontentloaded", timeout=25000)
            self.is_ready = True
            modo = "segundo plano (silencioso)" if headless else "ventana visible"
            print(f"[SBS Worker {self.worker_id}] Chromium listo en {modo}.")
        except Exception as e:
            print(f"[SBS Worker {self.worker_id}] Error al inicializar navegador: {e}")
            self.close_browser()

    def is_imperva_blocked(self):
        """Detecta si el portal SBS fue interceptado por la pantalla de seguridad de Imperva / Incapsula"""
        try:
            if not self.is_ready or not self.page or self.page.is_closed():
                return False
            body_text = self.page.inner_text("body")
            if "Additional security check is required" in body_text or "Imperva" in body_text or "Why am I seeing this page" in body_text:
                return True
            if "hcaptcha" in body_text.lower() and "soy humano" in body_text.lower():
                return True
            return False
        except Exception:
            return False

    def reset_session_clean(self):
        """Elimina cookies de Imperva al instante y recarga la página sin esperar 2 minutos"""
        print(f"[SBS Worker {self.worker_id}] Imperva detectado. Limpiando cookies y restaurando sesión limpia...")
        try:
            if self.context:
                self.context.clear_cookies()
        except Exception:
            pass
        
        try:
            if self.page and not self.page.is_closed():
                self.page.goto(SBS_URL, wait_until="domcontentloaded", timeout=15000)
                return
        except Exception:
            pass
        
        # Si la recarga falló, reiniciar contexto
        self.close_browser()
        time.sleep(0.5)
        self.init_browser(headless=self.get_headless())

    def is_browser_alive(self):
        """Verifica de forma activa si el navegador y la página siguen abiertos y respondiendo"""
        try:
            if not self.is_ready or not self.browser or not self.context or not self.page:
                return False
            if not self.browser.is_connected() or self.page.is_closed():
                return False
            self.page.evaluate("() => true")
            return True
        except Exception:
            return False

    def ensure_browser(self):
        """Si la ventana fue cerrada por el usuario o no está lista, la reabre"""
        if not self.is_browser_alive():
            modo = "segundo plano" if self.get_headless() else "ventana en pantalla"
            print(f"[SBS Worker {self.worker_id}] Iniciando navegador ({modo})...")
            self.close_browser()
            self.init_browser(headless=self.get_headless())

    def close_browser(self):
        """Cierra el navegador y la página de forma limpia e inmediata"""
        try:
            if self.page:
                self.page.close()
        except Exception:
            pass
        try:
            if self.context:
                self.context.close()
        except Exception:
            pass
        try:
            if self.browser:
                self.browser.close()
        except Exception:
            pass
        self.page = None
        self.context = None
        self.browser = None
        self.is_ready = False

    def shutdown(self):
        """Apagado definitivo del runtime de Playwright al salir"""
        self.running = False
        self.close_browser()
        try:
            if self.playwright:
                self.playwright.stop()
        except Exception:
            pass
        self.playwright = None

    def run(self):
        while self.running:
            try:
                task = self.task_queue.get(timeout=1.0)
            except queue.Empty:
                continue

            if task is None:
                break

            action = task.get('action')
            result_queue = task.get('result_queue')

            if action == 'query':
                self.interrupted = False
                res = self._execute_query(task['params'])
                if result_queue:
                    result_queue.put(res)
            elif action == 'stop':
                self.interrupted = True
                self.close_browser()
                if result_queue:
                    result_queue.put({'success': True})

            self.task_queue.task_done()

        self.close_browser()

    def _execute_query(self, params, retry_count=0):
        dni = params.get('dni', '').strip()
        ape_pat = params.get('ape_paterno', '').strip()
        ape_mat = params.get('ape_materno', '').strip()
        primer_nom = params.get('primer_nombre', '').strip()
        segundo_nom = params.get('segundo_nombre', '').strip()

        t0 = time.time()
        self.ensure_browser()

        if self.is_imperva_blocked():
            self.reset_session_clean()

        if not self.is_browser_alive():
            return {
                'afiliado_spp': None,
                'afp': 'VENTANA CERRADA',
                'cuspp': '-',
                'fecha_afiliacion': '-',
                'situacion': 'VENTANA CERRADA',
                'estado_sbs': 'ERROR',
                'mensaje': 'No se pudo abrir la ventana del navegador. Pulse "Reintentar".',
                'tiempo_seg': round(time.time() - t0, 2),
                'worker_id': self.worker_id
            }

        try:
            # 1. Si existe el botón "Consultar otro registro", reiniciar formulario
            try:
                btn_otro = self.page.query_selector("#ctl00_ContentPlaceHolder1_btnOtro_Registro")
                if btn_otro and btn_otro.is_visible():
                    btn_otro.click()
                    try:
                        self.page.wait_for_load_state('domcontentloaded', timeout=6000)
                        self.page.wait_for_timeout(150)
                    except Exception:
                        pass
            except Exception:
                pass

            # 2. Verificar que el formulario esté listo (o si saltó Imperva)
            if self.is_imperva_blocked() and retry_count < 2:
                print(f"[SBS Worker {self.worker_id}] Imperva detectado antes de llenar formulario (DNI {dni}). Reseteando cookies...")
                self.reset_session_clean()
                return self._execute_query(params, retry_count=retry_count + 1)

            if not self.page.query_selector("#ctl00_ContentPlaceHolder1_cboTipoDoc"):
                self.page.goto(SBS_URL, wait_until="domcontentloaded", timeout=18000)

            # 3. Llenar formulario
            self.page.select_option("#ctl00_ContentPlaceHolder1_cboTipoDoc", "00") # DNI
            self.page.fill("#ctl00_ContentPlaceHolder1_txtNumeroDoc", dni)
            self.page.fill("#ctl00_ContentPlaceHolder1_txtAp_pat", ape_pat)
            self.page.fill("#ctl00_ContentPlaceHolder1_txtAp_mat", ape_mat)
            self.page.fill("#ctl00_ContentPlaceHolder1_txtPri_nom", primer_nom)
            self.page.fill("#ctl00_ContentPlaceHolder1_txtSeg_nom", segundo_nom or "")

            # 4. Enviar búsqueda
            self.page.click("#ctl00_ContentPlaceHolder1_btnBuscar")
            
            # Esperar que la red complete el postback nativo de ASP.NET
            try:
                self.page.wait_for_load_state('networkidle', timeout=10000)
                self.page.wait_for_timeout(200)
            except Exception:
                self.page.wait_for_timeout(800)

            # 5. Analizar contenido
            body_text = self.page.inner_text("body")
            elapsed = round(time.time() - t0, 2)

            # Verificar si Imperva saltó tras pulsar Buscar
            if self.is_imperva_blocked() and retry_count < 2:
                print(f"[SBS Worker {self.worker_id}] Imperva saltó tras buscar DNI {dni}. Limpiando cookies y reintentando...")
                self.reset_session_clean()
                return self._execute_query(params, retry_count=retry_count + 1)

            if "No se encontraron resultados" in body_text:
                return {
                    'afiliado_spp': False,
                    'afp': 'NO REGISTRADO',
                    'cuspp': '-',
                    'fecha_afiliacion': '-',
                    'situacion': 'NO FIGURA EN SPP',
                    'estado_sbs': 'NO REGISTRADO',
                    'mensaje': 'No se encontraron resultados en el SPP (Verificar en AFPNET)',
                    'tiempo_seg': elapsed,
                    'worker_id': self.worker_id
                }

            if "Error: La consulta es sospechosa" in body_text:
                # Tratar como imperva soft-block
                if retry_count < 2:
                    self.reset_session_clean()
                    return self._execute_query(params, retry_count=retry_count + 1)
                return {
                    'afiliado_spp': None,
                    'afp': 'ERROR',
                    'cuspp': '-',
                    'fecha_afiliacion': '-',
                    'situacion': 'CONSULTA SOSPECHOSA',
                    'estado_sbs': 'ERROR',
                    'mensaje': 'El portal SBS bloqueó temporalmente la consulta',
                    'tiempo_seg': elapsed,
                    'worker_id': self.worker_id
                }

            # Identificar AFP
            afp_detectada = 'DESCONOCIDO'
            for afp_name in ['PROFUTURO', 'INTEGRA', 'PRIMA', 'HABITAT']:
                if afp_name in body_text.upper():
                    afp_detectada = afp_name
                    break

            # Extraer CUSPP
            m_cuspp = re.search(r'[0-9]{6}[A-Z0-9]{6}', body_text)
            cuspp = m_cuspp.group(0) if m_cuspp else '-'

            # Extraer fecha de afiliación (formato DD/MM/YYYY)
            m_fecha = re.search(r'desde el[\s\|:]*(\d{2}/\d{2}/\d{4})', body_text, re.IGNORECASE)
            fecha_afil = m_fecha.group(1) if m_fecha else '-'

            # Extraer situación
            m_sit = re.search(r'situaci[oó]n actual es[\s\|:]*([A-Za-z]+)', body_text, re.IGNORECASE)
            situacion = m_sit.group(1) if m_sit else 'AFILIADO'

            return {
                'afiliado_spp': True,
                'afp': afp_detectada,
                'cuspp': cuspp,
                'fecha_afiliacion': fecha_afil,
                'situacion': situacion,
                'estado_sbs': 'ENCONTRADO',
                'mensaje': f'Afiliado a {afp_detectada} desde {fecha_afil}',
                'tiempo_seg': elapsed,
                'worker_id': self.worker_id
            }

        except Exception as e:
            elapsed = round(time.time() - t0, 2)
            err_msg = str(e)
            print(f"[SBS Worker {self.worker_id}] Excepción durante consulta SBS: {err_msg}")
            
            if not self.is_browser_alive() or "closed" in err_msg.lower() or "target" in err_msg.lower():
                self.close_browser()
                return {
                    'afiliado_spp': None,
                    'afp': 'VENTANA CERRADA',
                    'cuspp': '-',
                    'fecha_afiliacion': '-',
                    'situacion': 'VENTANA CERRADA',
                    'estado_sbs': 'ERROR',
                    'mensaje': 'La ventana del navegador se cerró.',
                    'tiempo_seg': elapsed,
                    'worker_id': self.worker_id
                }
            
            if "timeout" in err_msg.lower():
                try:
                    self.page.goto(SBS_URL, wait_until="domcontentloaded", timeout=12000)
                except Exception:
                    self.close_browser()
                return {
                    'afiliado_spp': None,
                    'afp': 'TIMEOUT SBS',
                    'cuspp': '-',
                    'fecha_afiliacion': '-',
                    'situacion': 'LATENCIA SBS',
                    'estado_sbs': 'TIMEOUT',
                    'mensaje': 'El portal SBS tardó en responder. Se reintentará.',
                    'tiempo_seg': elapsed,
                    'worker_id': self.worker_id
                }

            try:
                self.page.goto(SBS_URL, wait_until="domcontentloaded", timeout=12000)
            except Exception:
                self.close_browser()

            return {
                'afiliado_spp': None,
                'afp': 'ERROR',
                'cuspp': '-',
                'fecha_afiliacion': '-',
                'situacion': 'ERROR CONEXIÓN',
                'estado_sbs': 'ERROR',
                'mensaje': f'Error en consulta SBS: {err_msg}',
                'tiempo_seg': elapsed,
                'worker_id': self.worker_id
            }


class SBSServiceManager:
    _instance = None
    _lock = threading.RLock()

    def __init__(self):
        self.concurrency = 1
        self.headless = False  # Por defecto visible en pantalla para la secretaria
        self.task_queue = queue.Queue()
        self.workers = []
        self._update_worker_pool(self.concurrency)

    @classmethod
    def get_instance(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = SBSServiceManager()
            return cls._instance

    def _update_worker_pool(self, target_concurrency):
        with self._lock:
            target_concurrency = max(1, min(3, target_concurrency))
            current_len = len(self.workers)

            if target_concurrency > current_len:
                for wid in range(current_len, target_concurrency):
                    w = SBSWorkerThread(worker_id=wid, task_queue=self.task_queue, manager=self)
                    w.start()
                    self.workers.append(w)
                    print(f"[SBSServiceManager] Worker {wid} iniciado (total: {len(self.workers)})")
            elif target_concurrency < current_len:
                to_remove = self.workers[target_concurrency:]
                self.workers = self.workers[:target_concurrency]
                for w in to_remove:
                    w.shutdown()
                    print(f"[SBSServiceManager] Worker {w.worker_id} detenido")

            self.concurrency = target_concurrency

    def set_config(self, concurrency=None, headless=None):
        with self._lock:
            if headless is not None:
                new_headless = bool(headless)
                if new_headless != self.headless:
                    self.headless = new_headless
                    # Reiniciar navegadores con el nuevo modo de visibilidad
                    for w in self.workers:
                        w.close_browser()
            if concurrency is not None:
                self._update_worker_pool(int(concurrency))
            return {
                'concurrency': self.concurrency,
                'headless': self.headless
            }

    def get_config(self):
        with self._lock:
            return {
                'concurrency': self.concurrency,
                'headless': self.headless
            }

    def set_concurrency(self, concurrency):
        return self.set_config(concurrency=concurrency)['concurrency']

    def get_concurrency(self):
        return self.concurrency

    def query_worker(self, dni, ape_pat, ape_mat, primer_nom, segundo_nom=""):
        res_queue = queue.Queue()
        self.task_queue.put({
            'action': 'query',
            'params': {
                'dni': dni,
                'ape_paterno': ape_pat,
                'ape_materno': ape_mat,
                'primer_nombre': primer_nom,
                'segundo_nombre': segundo_nom
            },
            'result_queue': res_queue
        })
        return res_queue.get(timeout=60)

    def stop(self):
        """Cierra inmediatamente todos los navegadores y drena la cola de tareas"""
        while not self.task_queue.empty():
            try:
                task = self.task_queue.get_nowait()
                rq = task.get('result_queue')
                if rq:
                    rq.put({'success': False, 'mensaje': 'Verificación cancelada por el usuario'})
                self.task_queue.task_done()
            except Exception:
                break

        with self._lock:
            for w in self.workers:
                try:
                    w.close_browser()
                except Exception as e:
                    print(f"[SBSServiceManager] Error al cerrar worker {w.worker_id}: {e}")

        return {'success': True, 'message': 'Todas las ventanas de Playwright fueron cerradas de inmediato.'}


def get_sbs_service():
    return SBSServiceManager.get_instance()

