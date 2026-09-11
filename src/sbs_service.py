"""
Servicio Conector Oficial para la SBS (Superintendencia de Banca y Seguros)
Utiliza un Pool de Worker Threads dedicados para Playwright con BrowserContexts
aislados, garantizando scraping paralelo estable, eliminación instantánea de
cookies ante retos de Imperva y cierre inmediato de ventanas.
"""
import time
import re
import os
import queue
import threading
import subprocess
from playwright.sync_api import sync_playwright
from src.siga_parser import clean_mojibake

SBS_URL = "https://servicios.sbs.gob.pe/ReporteSituacionPrevisional/Afil_Consulta.aspx"

# Posición en mosaico dinámica según worker_id
def get_window_position(worker_id):
    cols = 3
    col = worker_id % cols
    row = (worker_id // cols) % 3
    return {
        "x": 40 + (col * 350),
        "y": 40 + (row * 160),
        "width": 860,
        "height": 650
    }

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
            
            pos = get_window_position(self.worker_id)
            win_args = [
                f"--window-position={pos['x']},{pos['y']}",
                f"--window-size={pos['width']},{pos['height']}",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--lang=es-ES,es"
            ]

            if not self.browser or not self.browser.is_connected():
                self.browser = self.playwright.chromium.launch(
                    headless=headless,
                    slow_mo=20 if not headless else 0,
                    args=win_args
                )

            # Cada worker tiene su propio BrowserContext aislado (cookie jar propio)
            self.context = self.browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                locale="es-PE",
                timezone_id="America/Lima",
                viewport={"width": pos['width'] - 40, "height": pos['height'] - 80}
            )
            # Eliminar la marca navigator.webdriver para que Imperva no lo identifique como bot
            self.context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

            self.page = self.context.new_page()
            self.page.goto(SBS_URL, wait_until="domcontentloaded", timeout=25000)
            self.is_ready = True
            modo = "segundo plano (silencioso)" if headless else "ventana visible"
            print(f"[SBS Worker {self.worker_id}] Chromium listo en {modo}.")
        except Exception as e:
            print(f"[SBS Worker {self.worker_id}] Error al inicializar navegador: {e}")
            self.close_browser()

    def wait_cooldown_if_blocked(self):
        """Si algún worker activó una pausa de seguridad, esperar activamente a que expire"""
        if self.manager and hasattr(self.manager, 'cooldown_until'):
            while time.time() < self.manager.cooldown_until:
                if self.interrupted or not self.running:
                    break
                time.sleep(0.5)

    def is_imperva_blocked(self):
        """
        Detecta si el portal SBS fue bloqueado de verdad por el WAF Imperva o si la consulta fue rechazada.
        Evita absolutamente falsos positivos causados por el iframe invisible de Google reCAPTCHA v2 (que siempre está presente en el formulario).
        """
        try:
            if not self.is_ready or not self.page or self.page.is_closed():
                return False

            # Si el reporte ya está visible o el botón 'Consultar otro registro' está listo, NO está bloqueado
            try:
                if self.page.query_selector("#ctl00_ContentPlaceHolder1_btnOtro_Registro"):
                    return False
            except Exception:
                pass

            title = ""
            try:
                title = (self.page.title() or "").lower()
            except Exception:
                pass

            body_text = ""
            try:
                body_text = (self.page.inner_text("body") or "").lower()
            except Exception:
                pass

            # Si ya se determinó el resultado de afiliación o no afiliación, NO está bloqueado
            if any(k in body_text for k in [
                "reporte de situación previsional",
                "reporte de situacion previsional",
                "no se encontraron resultados",
                "profuturo", "integra", "prima", "habitat",
                "se encuentra afiliado"
            ]):
                return False

            # 1. Mensaje de consulta sospechosa emitido por la SBS
            if "error: la consulta es sospechosa" in body_text or "consulta sospechosa" in body_text:
                return True

            # 2. Pantallas de bloqueo perimetral de Imperva / Incapsula
            imperva_signatures = [
                "additional security check is required",
                "why am i seeing this page",
                "pardon our interruption",
                "incapsula incident id",
                "request unsuccessful",
                "access denied",
                "unusual traffic from your computer network",
                "bloqueo de seguridad"
            ]

            if any(sig in body_text or sig in title for sig in imperva_signatures):
                return True

            # 3. Solo si reCAPTCHA desplegó un puzzle visual interactivo (bframe visible)
            try:
                challenge_box = self.page.query_selector("iframe[src*='bframe']")
                if challenge_box and challenge_box.is_visible():
                    return True
            except Exception:
                pass

            return False
        except Exception:
            return False

    def handle_security_block(self, dni):
        """
        Estrategia óptima ante bloqueo o captcha de Imperva:
        1. Cierra de inmediato la ventana bloqueada para no mantener sockets sospechosos.
        2. Activa una pausa de seguridad configurable (block_cooldown) para permitir que el
           sistema WAF de la SBS disipe la penalización de IP (decay del puntaje de riesgo).
        3. Tras concluir el tiempo de espera, abre una ventana completamente nueva y limpia
           con propiedades stealth para reanudar la consulta de forma exitosa.
        """
        cooldown_sec = getattr(self.manager, 'block_cooldown', 45) if self.manager else 45
        print(f"[SBS Worker {self.worker_id}] Reto de seguridad/Captcha detectado en DNI {dni}.")
        print(f"[SBS Worker {self.worker_id}] Cerrando ventana bloqueada e iniciando pausa de seguridad de {cooldown_sec} segundos...")

        self.close_browser()

        if self.manager:
            with self.manager._lock:
                self.manager.cooldown_until = max(getattr(self.manager, 'cooldown_until', 0), time.time() + cooldown_sec)

        for _ in range(int(cooldown_sec * 2)):
            if self.interrupted or not self.running:
                return
            time.sleep(0.5)

        if self.interrupted or not self.running:
            return

        print(f"[SBS Worker {self.worker_id}] Pausa de seguridad cumplida. Reabriendo ventana limpia...")
        self.init_browser(headless=self.get_headless())

    def reopen_fresh_window(self):
        """Cierra la ventana actual y abre una nueva limpia"""
        self.close_browser()
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
        ape_pat = clean_mojibake(params.get('ape_paterno', ''))
        ape_mat = clean_mojibake(params.get('ape_materno', ''))
        primer_nom = clean_mojibake(params.get('primer_nombre', ''))
        segundo_nom = clean_mojibake(params.get('segundo_nombre', ''))

        t0 = time.time()

        if self.interrupted or not self.running:
            return {
                'afiliado_spp': None,
                'afp': 'CANCELADO',
                'cuspp': '-',
                'fecha_afiliacion': '-',
                'situacion': 'CANCELADO',
                'estado_sbs': 'CANCELADO',
                'mensaje': 'Verificación detenida por el usuario.',
                'tiempo_seg': 0,
                'worker_id': self.worker_id
            }

        # Si el servicio está en enfriamiento por bloqueo de seguridad, aguardar
        self.wait_cooldown_if_blocked()

        if self.interrupted or not self.running:
            return {
                'afiliado_spp': None,
                'afp': 'CANCELADO',
                'cuspp': '-',
                'fecha_afiliacion': '-',
                'situacion': 'CANCELADO',
                'estado_sbs': 'CANCELADO',
                'mensaje': 'Verificación detenida por el usuario.',
                'tiempo_seg': 0,
                'worker_id': self.worker_id
            }

        self.ensure_browser()

        if self.is_imperva_blocked():
            if retry_count < 2:
                self.handle_security_block(dni)
                return self._execute_query(params, retry_count=retry_count + 1)

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
                        self.page.wait_for_load_state('domcontentloaded', timeout=5000)
                        self.page.wait_for_timeout(100)
                    except Exception:
                        pass
            except Exception:
                pass

            # 2. Verificar si la pantalla quedó bloqueada por captcha antes de llenar
            if self.is_imperva_blocked() and retry_count < 2:
                self.handle_security_block(dni)
                return self._execute_query(params, retry_count=retry_count + 1)

            if not self.page.query_selector("#ctl00_ContentPlaceHolder1_cboTipoDoc"):
                try:
                    self.page.goto(SBS_URL, wait_until="domcontentloaded", timeout=15000)
                except Exception:
                    pass
                if self.is_imperva_blocked() and retry_count < 2:
                    self.handle_security_block(dni)
                    return self._execute_query(params, retry_count=retry_count + 1)

            # 3. Llenar formulario
            self.page.select_option("#ctl00_ContentPlaceHolder1_cboTipoDoc", "00") # DNI
            self.page.fill("#ctl00_ContentPlaceHolder1_txtNumeroDoc", dni)
            self.page.fill("#ctl00_ContentPlaceHolder1_txtAp_pat", ape_pat)
            self.page.fill("#ctl00_ContentPlaceHolder1_txtAp_mat", ape_mat)
            self.page.fill("#ctl00_ContentPlaceHolder1_txtPri_nom", primer_nom)
            self.page.fill("#ctl00_ContentPlaceHolder1_txtSeg_nom", segundo_nom or "")

            # 4. Enviar búsqueda
            self.page.click("#ctl00_ContentPlaceHolder1_btnBuscar")
            
            # Detectar activamente en micro-intervalos si ya respondió la SBS o si saltó el captcha:
            t_wait_start = time.time()
            while time.time() - t_wait_start < 12:
                if self.interrupted or not self.running:
                    return {
                        'afiliado_spp': None,
                        'afp': 'CANCELADO',
                        'cuspp': '-',
                        'fecha_afiliacion': '-',
                        'situacion': 'CANCELADO',
                        'estado_sbs': 'CANCELADO',
                        'mensaje': 'Verificación detenida por el usuario.',
                        'tiempo_seg': round(time.time() - t0, 2),
                        'worker_id': self.worker_id
                    }
                if self.is_imperva_blocked():
                    break
                try:
                    body_check = self.page.inner_text("body")
                    body_upper = body_check.upper()
                    if any(k in body_upper for k in [
                        "BTNOTRO_REGISTRO",
                        "NO SE ENCONTRARON",
                        "PROFUTURO",
                        "INTEGRA",
                        "PRIMA",
                        "HABITAT",
                        "ERROR: LA CONSULTA ES SOSPECHOSA",
                        "SITUACION ACTUAL ES",
                        "SITUACIÓN ACTUAL ES",
                        "DESDE EL",
                        "REPORTE DE SITUAC",
                        "CUSPP"
                    ]) or self.page.query_selector("#ctl00_ContentPlaceHolder1_btnOtro_Registro"):
                        break
                except Exception:
                    pass
                self.page.wait_for_timeout(250)

            # 5. Analizar contenido
            body_text = ""
            try:
                body_text = self.page.inner_text("body")
            except Exception:
                pass
            elapsed = round(time.time() - t0, 2)

            # Si saltó captcha o consulta sospechosa, activar la estrategia de enfriamiento
            if (self.is_imperva_blocked() or "Error: La consulta es sospechosa" in body_text) and retry_count < 2:
                self.handle_security_block(dni)
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

            if "Error: La consulta es sospechosa" in body_text or self.is_imperva_blocked():
                return {
                    'afiliado_spp': None,
                    'afp': 'BLOQUEO TEMPORAL SBS',
                    'cuspp': '-',
                    'fecha_afiliacion': '-',
                    'situacion': 'PAUSA DE SEGURIDAD',
                    'estado_sbs': 'BLOQUEO_SEGURIDAD',
                    'mensaje': 'El portal SBS impuso una pausa por tráfico. Aguarde unos instantes.',
                    'tiempo_seg': elapsed,
                    'worker_id': self.worker_id
                }

            # Identificar AFP
            afp_detectada = None
            for afp_name in ['PROFUTURO', 'INTEGRA', 'PRIMA', 'HABITAT']:
                if afp_name in body_text.upper():
                    afp_detectada = afp_name
                    break

            if not afp_detectada:
                # Si no figura ninguna AFP válida y tampoco "No se encontraron resultados":
                # La consulta se topó con un reto de reCAPTCHA, bloqueo o la página no cargó el reporte
                return {
                    'afiliado_spp': None,
                    'afp': 'RETO RECAPTCHA',
                    'cuspp': '-',
                    'fecha_afiliacion': '-',
                    'situacion': 'RETO CAPTCHA',
                    'estado_sbs': 'RECAPTCHA_CHALLENGE',
                    'mensaje': 'El portal SBS presentó reCAPTCHA o la respuesta no cargó a tiempo.',
                    'tiempo_seg': elapsed,
                    'worker_id': self.worker_id
                }

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
            if self.interrupted or not self.running:
                return {
                    'afiliado_spp': None,
                    'afp': 'CANCELADO',
                    'cuspp': '-',
                    'fecha_afiliacion': '-',
                    'situacion': 'CANCELADO',
                    'estado_sbs': 'CANCELADO',
                    'mensaje': 'Verificación detenida por el usuario.',
                    'tiempo_seg': elapsed,
                    'worker_id': self.worker_id
                }
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
        self.delay_between = 1.0  # Pausa prudencial entre consultas consecutivas
        self.block_cooldown = 45  # Tiempo de enfriamiento si la SBS detecta tráfico
        self.max_retries = 5     # Reintentos continuos ante reto de captcha o latencia
        self.cooldown_until = 0   # Timestamp hasta cuando el sistema debe estar en pausa
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
            target_concurrency = max(1, min(10, int(target_concurrency)))
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

    def set_config(self, concurrency=None, headless=None, delay_between=None, block_cooldown=None, max_retries=None):
        with self._lock:
            if headless is not None:
                new_headless = bool(headless)
                if new_headless != self.headless:
                    self.headless = new_headless
                    for w in self.workers:
                        w.close_browser()
            if concurrency is not None:
                self._update_worker_pool(int(concurrency))
            if delay_between is not None:
                self.delay_between = max(0.0, float(delay_between))
            if block_cooldown is not None:
                self.block_cooldown = max(5, int(block_cooldown))
            if max_retries is not None:
                self.max_retries = max(1, min(10, int(max_retries)))

            return {
                'concurrency': self.concurrency,
                'headless': self.headless,
                'delay_between': self.delay_between,
                'block_cooldown': self.block_cooldown,
                'max_retries': self.max_retries
            }

    def get_config(self):
        with self._lock:
            return {
                'concurrency': self.concurrency,
                'headless': self.headless,
                'delay_between': getattr(self, 'delay_between', 1.0),
                'block_cooldown': getattr(self, 'block_cooldown', 45),
                'max_retries': getattr(self, 'max_retries', 5)
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
        timeout_wait = max(120, int(getattr(self, 'block_cooldown', 45)) * 2 + 30)
        try:
            return res_queue.get(timeout=timeout_wait)
        except queue.Empty:
            return {
                'afiliado_spp': None,
                'afp': 'TIMEOUT SBS',
                'cuspp': '-',
                'fecha_afiliacion': '-',
                'situacion': 'TIMEOUT',
                'estado_sbs': 'TIMEOUT',
                'mensaje': 'Tiempo de consulta agotado',
                'tiempo_seg': timeout_wait
            }

    def stop(self):
        """Cierra inmediatamente todos los navegadores y drena la cola de tareas"""
        # 1. Cancelar cualquier cooldown activo
        self.cooldown_until = 0

        # 2. Drenar la cola de tareas pendientes para que ningún request quede colgado
        while not self.task_queue.empty():
            try:
                task = self.task_queue.get_nowait()
                rq = task.get('result_queue')
                if rq:
                    rq.put({
                        'afiliado_spp': None,
                        'afp': 'CANCELADO',
                        'cuspp': '-',
                        'fecha_afiliacion': '-',
                        'situacion': 'CANCELADO',
                        'estado_sbs': 'CANCELADO',
                        'mensaje': 'Verificación cancelada por el usuario'
                    })
                self.task_queue.task_done()
            except Exception:
                break

        # 3. Marcar a todos los workers como interrumpidos y cerrar/matar procesos de Chromium
        with self._lock:
            for w in self.workers:
                w.interrupted = True
                w.running = False
                try:
                    if w.playwright and hasattr(w.playwright, '_impl_obj'):
                        proc = getattr(w.playwright._impl_obj._connection._transport, '_proc', None)
                        if proc and proc.pid:
                            subprocess.call(f'taskkill /F /T /PID {proc.pid}', shell=True)
                except Exception as e:
                    print(f"[SBSServiceManager] Error al terminar proceso de worker {w.worker_id}: {e}")

                w.page = None
                w.context = None
                w.browser = None
                w.playwright = None
                w.is_ready = False

            # 4. Vaciar la lista y regenerar el pool limpio para permitir reanudar
            self.workers = []
            self._update_worker_pool(self.concurrency)

        return {'success': True, 'message': 'Todas las ventanas de Playwright fueron cerradas de inmediato.'}


def get_sbs_service():
    return SBSServiceManager.get_instance()

