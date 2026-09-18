"""
Servicio Conector Oficial para la SBS (Superintendencia de Banca y Seguros)
Utiliza un Pool de Worker Threads dedicados para Playwright con BrowserContexts
aislados, garantizando scraping paralelo estable, eliminación instantánea de
cookies ante retos de Imperva y cierre inmediato de ventanas.
"""
import time
import re
import os
import sys
import tempfile
import queue
import threading
import subprocess
import json
import random
import unicodedata
from datetime import datetime


from playwright.sync_api import sync_playwright
try:
    from siga_parser import clean_mojibake
    from paths import data_path
except ImportError:
    from src.siga_parser import clean_mojibake
    from src.paths import data_path

SBS_URL = "https://servicios.sbs.gob.pe/ReporteSituacionPrevisional/Afil_Consulta.aspx"

# Marca inyectada en la línea de comandos de cada Chromium lanzado por este servicio,
# para poder ubicarlos y forzar su cierre inmediato al detener (ver stop()/kill_marked_chromium),
# sin depender de atributos internos y frágiles de la API de Playwright.
MPFN_KILL_MARKER = "mpfn-sbs-verificacion-marker"


def sanitize_sbs_name(name_str):
    """
    Sanitiza nombres y apellidos para el formulario del portal SBS:
    1. Resuelve posibles errores de mojibake (caracteres corruptos).
    2. Elimina apóstrofes, comillas y diacríticos (ej: "PIER'S" -> "PIERS", "O'NEILL" -> "ONEILL").
    3. Reemplaza vocales con diéresis o tildes por su letra base (ej: "AGÜERO" -> "AGUERO", "PIËR" -> "PIER").
    4. Preserva la letra 'Ñ' y elimina caracteres no alfabéticos que rechace el validador cliente de la SBS.
    """
    if not name_str:
        return ''
    s = str(name_str).strip()
    # Eliminar apóstrofes, comillas, acentos graves, circunflejos y símbolos de diéresis flotantes
    s = re.sub(r"['\"`’‘´^¨]", "", s)
    # Proteger Ñ antes de la descomposición canónica de tildes
    s = s.replace('Ñ', '__ENE_MAY__').replace('ñ', '__ene_min__')
    # Descomponer caracteres acentuados o con diéresis (NFD) y filtrar diacríticos
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    # Restaurar Ñ
    s = s.replace('__ENE_MAY__', 'Ñ').replace('__ene_min__', 'Ñ')
    # Aplicar resolución de mojibake residual
    s = clean_mojibake(s)
    # Permitir solo letras A-Z, Ñ y espacios (eliminar números o símbolos no alfabéticos)
    s = re.sub(r"[^A-Za-zÑ\s]", " ", s)
    # Normalizar espacios múltiples
    s = re.sub(r"\s+", " ", s).strip()
    return s.upper()


def get_powershell_cmd():
    import shutil
    ps = shutil.which('powershell')
    if ps:
        return ps
    sys_root = os.environ.get('SystemRoot', r'C:\Windows')
    ps_def = os.path.join(sys_root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    if os.path.exists(ps_def):
        return ps_def
    return None


def kill_marked_chromium():
    """Cierra de inmediato, a nivel de sistema operativo, todos los procesos chrome.exe
    lanzados por este servicio (identificados por MPFN_KILL_MARKER).
    Utiliza -EncodedCommand (Base64 UTF-16LE) para evitar fallos de comillas en Windows."""
    if sys.platform != 'win32':
        return
    try:
        ps_cmd = get_powershell_cmd()
        if not ps_cmd:
            return
        import base64
        ps_script = (
            "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | "
            f"Where-Object {{ $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*{MPFN_KILL_MARKER}*' }} | "
            "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
        )
        b64 = base64.b64encode(ps_script.encode('utf-16le')).decode('ascii')
        subprocess.run(
            [ps_cmd, '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64],
            timeout=8, capture_output=True
        )
    except Exception as e:
        print(f"[SBSServiceManager] Error al forzar cierre de ventanas Chromium: {e}")


def send_marked_windows_to_back():
    """En modo 'Ventana Visible', evita que las ventanas del bot SBS se antepongan a las
    ventanas con las que el usuario está trabajando en ese momento: las manda al fondo del
    z-order de Windows sin robarles el foco (SWP_NOACTIVATE)."""
    if sys.platform != 'win32':
        return
    try:
        ps_cmd = get_powershell_cmd()
        if not ps_cmd:
            return
        import ctypes
        import base64

        ps_script = (
            "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | "
            f"Where-Object {{ $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*{MPFN_KILL_MARKER}*' }} | "
            "Select-Object -ExpandProperty ProcessId"
        )
        b64 = base64.b64encode(ps_script.encode('utf-16le')).decode('ascii')
        result = subprocess.run(
            [ps_cmd, '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64],
            timeout=6, capture_output=True, text=True
        )
        pids = {int(p) for p in result.stdout.split() if p.strip().isdigit()}
        if not pids:
            return

        user32 = ctypes.windll.user32
        HWND_BOTTOM = 1
        SWP_NOMOVE = 0x0002
        SWP_NOSIZE = 0x0001
        SWP_NOACTIVATE = 0x0010

        def _callback(hwnd, _lparam):
            pid = ctypes.c_ulong()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value in pids and user32.IsWindowVisible(hwnd):
                cls_buf = ctypes.create_unicode_buffer(64)
                user32.GetClassNameW(hwnd, cls_buf, 64)
                if cls_buf.value.startswith('Chrome_WidgetWin'):
                    user32.SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
            return True

        EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
        user32.EnumWindows(EnumWindowsProc(_callback), 0)
    except Exception as e:
        print(f"[SBSServiceManager] No se pudo reordenar ventanas Chromium al fondo: {e}")

# Posición en mosaico dinámica según worker_id
def get_window_position(worker_id):
    cols = 3
    col = worker_id % cols
    row = (worker_id // cols) % 3
    return {
        "x": 60 + (col * 350),
        "y": 60 + (row * 160),
        "width": 920,
        "height": 680
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
        self.current_headless = None
        self.driver_pid = None

    def get_headless(self):
        if self.manager and hasattr(self.manager, 'headless'):
            return bool(self.manager.headless)
        return False

    def init_browser(self, headless=None):
        try:
            if headless is None:
                headless = self.get_headless()
            self.current_headless = headless

            if not self.playwright:
                self.playwright = sync_playwright().start()
                try:
                    proc = getattr(self.playwright._impl_obj._connection._transport, '_proc', None)
                    if proc and proc.pid:
                        self.driver_pid = proc.pid
                except Exception:
                    pass
            
            pos = get_window_position(self.worker_id)
            win_args = [
                f"--window-position={pos['x']},{pos['y']}",
                f"--window-size={pos['width']},{pos['height']}",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--lang=es-ES,es",
                f"--{MPFN_KILL_MARKER}"
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
            modo = "segundo plano (silencioso)" if headless else "ventana visible en pantalla"
            print(f"[SBS Worker {self.worker_id}] Navegador Chromium listo en {modo}.")
            if not headless:
                # No robar el foco de la persona usuaria: la ventana queda visible pero
                # detrás de las ventanas con las que ya estaba trabajando.
                send_marked_windows_to_back()
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
        cooldown_sec = _resolve_seconds(getattr(self.manager, 'block_cooldown', "3-7")) if self.manager else _resolve_seconds("3-7")
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
        """Si la ventana fue cerrada por el usuario o cambió el modo de visibilidad, la reabre limpiamente"""
        desired_headless = self.get_headless()
        if not self.is_browser_alive() or self.current_headless != desired_headless:
            modo = "segundo plano" if desired_headless else "ventana en pantalla"
            print(f"[SBS Worker {self.worker_id}] Reconfigurando o iniciando navegador ({modo})...")
            self.close_browser()
            self.init_browser(headless=desired_headless)

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

    def _ensure_and_click_buscar(self, dni):
        """
        Asegura que el botón 'Buscar' sea presionado con éxito y despache la consulta:
        1. Desplaza el botón al centro visible del viewport (evita problemas en pantallas pequeñas/laptops).
        2. Satisface las validaciones de cliente de ASP.NET para que el postback no sea bloqueado.
        3. Despacha la búsqueda mediante Playwright con fallback integral en JavaScript (DoPost / DoValidate / click).
        """
        try:
            # 1. Asegurar visibilidad en el viewport
            btn_loc = self.page.locator("#ctl00_ContentPlaceHolder1_btnBuscar")
            if btn_loc.count() > 0:
                try:
                    btn_loc.scroll_into_view_if_needed(timeout=2000)
                except Exception:
                    pass

            # 2. Despacho mediante JavaScript asegurando validaciones y reCAPTCHA
            self.page.evaluate("""() => {
                const btn = document.getElementById('ctl00_ContentPlaceHolder1_btnBuscar');
                if (!btn) return;

                // Asegurar que validadores cliente de ASP.NET permitan el postback
                if (typeof Page_IsValid !== 'undefined') Page_IsValid = true;
                if (typeof Page_Validators !== 'undefined' && Array.isArray(Page_Validators)) {
                    for (let i = 0; i < Page_Validators.length; i++) {
                        const val = Page_Validators[i];
                        if (val) {
                            val.isvalid = true;
                            if (val.style) val.style.display = 'none';
                        }
                    }
                }

                // Si DoLoad no se ha ejecutado, correrlo para inicializar btnBuscarEvent
                if (typeof window.DoLoad === 'function' && typeof window.btnBuscarEvent === 'undefined') {
                    try { window.DoLoad(); } catch(e) {}
                }

                // Caso A: Si grecaptcha ya generó un token, ejecutar directamente DoPost()
                const recaptchaResp = document.getElementById('g-recaptcha-response');
                if (recaptchaResp && recaptchaResp.value && typeof window.DoPost === 'function') {
                    window.DoPost();
                    return;
                }

                // Caso B: Si DoValidate está disponible en window o como onclick
                if (typeof window.DoValidate === 'function') {
                    try {
                        window.DoValidate(new Event('click'));
                        return;
                    } catch(e) {}
                }

                // Caso C: Despachar evento click nativo
                try {
                    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                } catch(e) {
                    btn.click();
                }
            }""")

            # 3. Disparo complementario con Playwright
            try:
                self.page.click("#ctl00_ContentPlaceHolder1_btnBuscar", timeout=2000, force=True)
            except Exception:
                pass

        except Exception as e:
            print(f"[SBS Worker {self.worker_id}] Advertencia al pulsar botón Buscar: {e}")

    def _execute_query(self, params, retry_count=0):
        dni = params.get('dni', '').strip()
        ape_pat = sanitize_sbs_name(params.get('ape_paterno', ''))
        ape_mat = sanitize_sbs_name(params.get('ape_materno', ''))
        primer_nom = sanitize_sbs_name(params.get('primer_nombre', ''))
        segundo_nom = sanitize_sbs_name(params.get('segundo_nombre', ''))

        max_retries = getattr(self.manager, 'max_retries', 25) if self.manager else 25

        if self.manager:
            self.manager.set_attempt(dni, retry_count + 1)

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
            if retry_count < max_retries:
                self.handle_security_block(dni)
                return self._execute_query(params, retry_count=retry_count + 1)

        if not self.is_browser_alive():
            if retry_count < max_retries:
                self.handle_security_block(dni)
                return self._execute_query(params, retry_count=retry_count + 1)
            return {
                'afiliado_spp': None,
                'afp': 'VENTANA CERRADA',
                'cuspp': '-',
                'fecha_afiliacion': '-',
                'situacion': 'VENTANA CERRADA',
                'estado_sbs': 'ERROR',
                'mensaje': 'No se pudo abrir la ventana del navegador tras varios reintentos.',
                'tiempo_seg': round(time.time() - t0, 2),
                'worker_id': self.worker_id
            }

        try:
            if not self.current_headless:
                try:
                    self.page.bring_to_front()
                except Exception:
                    pass

            # 1. Si la ventana está en la pantalla del Reporte de Afiliación (con botón "Consultar otro registro"):
            btn_otro = self.page.query_selector("#ctl00_ContentPlaceHolder1_btnOtro_Registro")
            if btn_otro and btn_otro.is_visible():
                btn_otro.click(timeout=6000)
                try:
                    self.page.wait_for_selector("#ctl00_ContentPlaceHolder1_txtNumeroDoc", state="visible", timeout=10000)
                    self.page.wait_for_timeout(200)
                except Exception:
                    pass

            # 2. Si no está visible el formulario ni el botón otro registro, ir a la URL oficial
            if not self.page.query_selector("#ctl00_ContentPlaceHolder1_txtNumeroDoc"):
                try:
                    self.page.goto(SBS_URL, wait_until="domcontentloaded", timeout=15000)
                    self.page.wait_for_selector("#ctl00_ContentPlaceHolder1_txtNumeroDoc", state="visible", timeout=10000)
                except Exception:
                    pass

            if self.is_imperva_blocked() and retry_count < max_retries:
                self.handle_security_block(dni)
                return self._execute_query(params, retry_count=retry_count + 1)

            # 3. Limpiar cualquier texto de respuesta o mensaje residual del trabajador previo
            try:
                self.page.evaluate("""() => {
                    const msg = document.querySelector('#ctl00_ContentPlaceHolder1_lblMensaje, #ctl00_ContentPlaceHolder1_lblError, #ctl00_ContentPlaceHolder1_lblErrorTxt');
                    if (msg) msg.textContent = '';
                }""")
            except Exception:
                pass

            # 4. Llenar formulario con datos del trabajador actual
            self.page.select_option("#ctl00_ContentPlaceHolder1_cboTipoDoc", "00", timeout=6000) # DNI
            self.page.fill("#ctl00_ContentPlaceHolder1_txtNumeroDoc", dni, timeout=6000)
            self.page.fill("#ctl00_ContentPlaceHolder1_txtAp_pat", ape_pat, timeout=6000)
            self.page.fill("#ctl00_ContentPlaceHolder1_txtAp_mat", ape_mat, timeout=6000)
            self.page.fill("#ctl00_ContentPlaceHolder1_txtPri_nom", primer_nom, timeout=6000)
            self.page.fill("#ctl00_ContentPlaceHolder1_txtSeg_nom", segundo_nom or "", timeout=6000)

            # Esperar brevemente a que reCAPTCHA esté listo en conexiones lentas o PCs con menor CPU
            try:
                self.page.wait_for_function(
                    "() => (typeof window.grecaptcha !== 'undefined' && typeof window.grecaptcha.execute === 'function') || document.querySelector('#ctl00_ContentPlaceHolder1_btnOtro_Registro') !== null",
                    timeout=2500
                )
            except Exception:
                pass

            # 5. Marcar el DOM con el DNI actual para saber cuándo el postback de SBS ha respondido de verdad
            self.page.evaluate(f"() => document.body.setAttribute('data-sbs-cur-dni', '{dni}')")

            # 6. Enviar búsqueda asegurando visibilidad y despacho
            self._ensure_and_click_buscar(dni)
            
            # 7. Esperar activamente en micro-intervalos a que el servidor de la SBS entregue la respuesta
            t_wait_start = time.time()
            last_retrigger_time = t_wait_start
            retrigger_count = 0
            max_retriggers = 3
            response_arrived = False

            while time.time() - t_wait_start < 15:
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
                    # Caso A: Se cargó la pantalla de Reporte Oficial (Afiliado encontrado)
                    btn_otro_now = self.page.query_selector("#ctl00_ContentPlaceHolder1_btnOtro_Registro")
                    if btn_otro_now and btn_otro_now.is_visible():
                        response_arrived = True
                        break

                    # Caso B: El postback ha respondido (el atributo data-sbs-cur-dni fue reemplazado por la respuesta del servidor)
                    attr_marker = self.page.evaluate("() => document.body.getAttribute('data-sbs-cur-dni')")
                    if not attr_marker:
                        b_text = self.page.inner_text("body").upper()
                        if any(k in b_text for k in [
                            "NO SE ENCONTRARON RESULTADOS",
                            "PROFUTURO", "INTEGRA", "PRIMA", "HABITAT",
                            "ERROR: LA CONSULTA ES SOSPECHOSA",
                            "SE ENCUENTRA AFILIADO",
                            "REPORTE DE SITUACI"
                        ]):
                            response_arrived = True
                            break

                    # Caso C: Reintento proactivo si el servidor aún no inicia el postback tras 2.2 segundos
                    now = time.time()
                    if attr_marker == dni and (now - last_retrigger_time >= 2.2) and retrigger_count < max_retriggers:
                        retrigger_count += 1
                        last_retrigger_time = now
                        print(f"[SBS Worker {self.worker_id}] Confirmando/reintentando presionar botón Buscar (intento {retrigger_count + 1} para DNI {dni})...")
                        self._ensure_and_click_buscar(dni)
                except Exception:
                    pass
                self.page.wait_for_timeout(200)

            # 8. Analizar contenido
            body_text = ""
            try:
                body_text = self.page.inner_text("body")
            except Exception:
                pass
            elapsed = round(time.time() - t0, 2)

            # Si saltó captcha o consulta sospechosa, activar la estrategia de enfriamiento
            if (self.is_imperva_blocked() or "Error: La consulta es sospechosa" in body_text) and retry_count < max_retries:
                self.handle_security_block(dni)
                return self._execute_query(params, retry_count=retry_count + 1)

            # PRIORIDAD 1: Identificar AFP y extraer datos si el trabajador está afiliado
            afp_detectada = None
            for afp_name in ['PROFUTURO', 'INTEGRA', 'PRIMA', 'HABITAT']:
                if afp_name in body_text.upper():
                    afp_detectada = afp_name
                    break

            now_str = datetime.now().strftime('%d/%m/%Y %H:%M:%S')

            if afp_detectada:
                # Extraer CUSPP
                m_cuspp = re.search(r'[0-9]{6}[A-Z0-9]{6}', body_text)
                cuspp = m_cuspp.group(0) if m_cuspp else '-'

                # Extraer fecha de afiliación (formato DD/MM/YYYY)
                m_fecha = re.search(r'desde el[\s\|:]*(\d{2}/\d{2}/\d{4})', body_text, re.IGNORECASE)
                fecha_afil = m_fecha.group(1) if m_fecha else '-'

                # Extraer situación
                m_sit = re.search(r'situaci[oó]n actual es[\s\|:]*([A-Za-z]+)', body_text, re.IGNORECASE)
                situacion = m_sit.group(1) if m_sit else 'AFILIADO'

                # Extraer fecha de consulta reportada por SBS si aparece en el texto
                m_fechareg = re.search(r'Informaci[oó]n al\s*:\s*(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}:\d{2})', body_text, re.IGNORECASE)
                fecha_consulta_sbs = m_fechareg.group(1) if m_fechareg else now_str

                # Extraer fecha de devengue si está presente
                m_dev = re.search(r'fecha de devengue[^\n:]*:\s*([^\n\r]+)', body_text, re.IGNORECASE)
                fecha_dev = m_dev.group(1).strip() if m_dev else 'No hay datos'

                return {
                    'afiliado_spp': True,
                    'afp': afp_detectada,
                    'cuspp': cuspp,
                    'fecha_afiliacion': fecha_afil,
                    'situacion': situacion,
                    'fecha_devengue': fecha_dev,
                    'fecha_consulta': fecha_consulta_sbs,
                    'estado_sbs': 'ENCONTRADO',
                    'mensaje': f'Afiliado a {afp_detectada} desde {fecha_afil}',
                    'tiempo_seg': elapsed,
                    'worker_id': self.worker_id
                }

            # PRIORIDAD 2: Si confirmó que no se encontraron resultados (NO REGISTRADO verificado)
            if "No se encontraron resultados" in body_text and response_arrived:
                return {
                    'afiliado_spp': False,
                    'afp': 'NO REGISTRADO',
                    'cuspp': '-',
                    'fecha_afiliacion': '-',
                    'situacion': 'NO FIGURA EN SPP',
                    'fecha_devengue': 'No hay datos',
                    'fecha_consulta': now_str,
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
                    'fecha_consulta': now_str,
                    'estado_sbs': 'BLOQUEO_SEGURIDAD',
                    'mensaje': 'El portal SBS impuso una pausa por tráfico. Aguarde unos instantes.',
                    'tiempo_seg': elapsed,
                    'worker_id': self.worker_id
                }

            # Si no figura ninguna AFP válida y tampoco "No se encontraron resultados" confirmados:
            # (reto de captcha o simple latencia del portal): reintentar antes de darlo por fallido
            if retry_count < max_retries:
                self.handle_security_block(dni)
                return self._execute_query(params, retry_count=retry_count + 1)
            return {
                'afiliado_spp': None,
                'afp': 'RETO RECAPTCHA',
                'cuspp': '-',
                'fecha_afiliacion': '-',
                'situacion': 'RETO CAPTCHA',
                'fecha_consulta': now_str,
                'estado_sbs': 'RECAPTCHA_CHALLENGE',
                'mensaje': 'El portal SBS presentó reCAPTCHA o la respuesta no cargó a tiempo, tras varios reintentos.',
                'tiempo_seg': elapsed,
                'worker_id': self.worker_id
            }

        except Exception as e:
            elapsed = round(time.time() - t0, 2)
            err_msg = str(e)
            now_str = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
            if self.interrupted or not self.running:
                return {
                    'afiliado_spp': None,
                    'afp': 'CANCELADO',
                    'cuspp': '-',
                    'fecha_afiliacion': '-',
                    'situacion': 'CANCELADO',
                    'fecha_consulta': now_str,
                    'estado_sbs': 'CANCELADO',
                    'mensaje': 'Verificación detenida por el usuario.',
                    'tiempo_seg': elapsed,
                    'worker_id': self.worker_id
                }
            print(f"[SBS Worker {self.worker_id}] Excepción durante consulta SBS: {err_msg}")
            
            if not self.is_browser_alive() or "closed" in err_msg.lower() or "target" in err_msg.lower():
                self.close_browser()
                if retry_count < max_retries:
                    self.handle_security_block(dni)
                    return self._execute_query(params, retry_count=retry_count + 1)
                return {
                    'afiliado_spp': None,
                    'afp': 'VENTANA CERRADA',
                    'cuspp': '-',
                    'fecha_afiliacion': '-',
                    'situacion': 'VENTANA CERRADA',
                    'fecha_consulta': now_str,
                    'estado_sbs': 'ERROR',
                    'mensaje': 'La ventana del navegador se cerró tras varios reintentos.',
                    'tiempo_seg': elapsed,
                    'worker_id': self.worker_id
                }

            if "timeout" in err_msg.lower():
                try:
                    self.page.goto(SBS_URL, wait_until="domcontentloaded", timeout=12000)
                except Exception:
                    self.close_browser()
                if retry_count < max_retries:
                    self.handle_security_block(dni)
                    return self._execute_query(params, retry_count=retry_count + 1)
                return {
                    'afiliado_spp': None,
                    'afp': 'TIMEOUT SBS',
                    'cuspp': '-',
                    'fecha_afiliacion': '-',
                    'situacion': 'LATENCIA SBS',
                    'fecha_consulta': now_str,
                    'estado_sbs': 'TIMEOUT',
                    'mensaje': 'El portal SBS tardó en responder, tras varios reintentos.',
                    'tiempo_seg': elapsed,
                    'worker_id': self.worker_id
                }

            try:
                self.page.goto(SBS_URL, wait_until="domcontentloaded", timeout=12000)
            except Exception:
                self.close_browser()

            if retry_count < max_retries:
                self.handle_security_block(dni)
                return self._execute_query(params, retry_count=retry_count + 1)

            return {
                'afiliado_spp': None,
                'afp': 'ERROR',
                'cuspp': '-',
                'fecha_afiliacion': '-',
                'situacion': 'ERROR CONEXIÓN',
                'fecha_consulta': now_str,
                'estado_sbs': 'ERROR',
                'mensaje': f'Error en consulta SBS tras varios reintentos: {err_msg}',
                'tiempo_seg': elapsed,
                'worker_id': self.worker_id
            }


def _normalize_delay(value):
    """Acepta un número fijo (2.5) o un rango 'min-max' (10-20) para la espera entre consultas."""
    if isinstance(value, str) and '-' in value:
        lo_str, _, hi_str = value.partition('-')
        try:
            lo = max(0.0, float(lo_str.strip()))
            hi = max(0.0, float(hi_str.strip()))
            if hi < lo:
                lo, hi = hi, lo
            return f"{lo}-{hi}"
        except ValueError:
            return value.strip()
    try:
        return max(0.0, float(value))
    except (TypeError, ValueError):
        return value


def _resolve_seconds(value, default=5.0):
    """Convierte un valor de configuración (número fijo o rango 'min-max') en segundos
    concretos a esperar. Si es un rango, sortea un valor aleatorio dentro de él."""
    if isinstance(value, str) and '-' in value:
        lo_str, _, hi_str = value.partition('-')
        try:
            lo, hi = float(lo_str.strip()), float(hi_str.strip())
            if hi < lo:
                lo, hi = hi, lo
            return random.uniform(lo, hi)
        except ValueError:
            return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _max_seconds(value, default=7.0):
    """Extrae el límite superior de un valor de configuración (número o rango 'min-max'),
    para cálculos de presupuesto/timeout que deben cubrir el peor caso."""
    if isinstance(value, str) and '-' in value:
        lo_str, _, hi_str = value.partition('-')
        try:
            return max(float(lo_str.strip()), float(hi_str.strip()))
        except ValueError:
            return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class SBSServiceManager:
    _instance = None
    _lock = threading.RLock()
    CONFIG_FILE = data_path('sbs_config.json')

    def __init__(self):
        self.concurrency = 3
        self.headless = False  # Por defecto visible en pantalla para la secretaria
        self.delay_between = 2.0  # Pausa prudencial entre consultas consecutivas
        self.block_cooldown = "3-7"  # Tiempo de enfriamiento si la SBS detecta tráfico (fijo o rango "min-max")
        self.max_retries = 25     # Reintentos continuos ante reto de captcha o latencia
        self.cooldown_until = 0   # Timestamp hasta cuando el sistema debe estar en pausa
        self.attempt_status = {}  # dni -> número de intento en curso (para el tag "Revisando #N")
        self.task_queue = queue.Queue()
        self.workers = []
        self._load_persisted_config()
        self._update_worker_pool(self.concurrency)

    def _load_persisted_config(self):
        if os.path.exists(self.CONFIG_FILE):
            try:
                with open(self.CONFIG_FILE, 'r', encoding='utf-8') as f:
                    cfg = json.load(f)
                    if 'concurrency' in cfg:
                        self.concurrency = max(1, min(10, int(cfg['concurrency'])))
                    if 'headless' in cfg:
                        self.headless = bool(cfg['headless'])
                    if 'delay_between' in cfg:
                        self.delay_between = _normalize_delay(cfg['delay_between'])
                    if 'block_cooldown' in cfg:
                        self.block_cooldown = _normalize_delay(cfg['block_cooldown'])
                    if 'max_retries' in cfg:
                        self.max_retries = max(1, min(50, int(cfg['max_retries'])))
            except Exception as e:
                print(f"[SBSServiceManager] No se pudo leer {self.CONFIG_FILE}: {e}")

    def _save_persisted_config(self):
        try:
            with open(self.CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump({
                    'concurrency': self.concurrency,
                    'headless': self.headless,
                    'delay_between': self.delay_between,
                    'block_cooldown': self.block_cooldown,
                    'max_retries': self.max_retries
                }, f, indent=2)
        except Exception as e:
            print(f"[SBSServiceManager] No se pudo guardar {self.CONFIG_FILE}: {e}")

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
                self.delay_between = _normalize_delay(delay_between)
            if block_cooldown is not None:
                self.block_cooldown = _normalize_delay(block_cooldown)
            if max_retries is not None:
                self.max_retries = max(1, min(50, int(max_retries)))

            self._save_persisted_config()

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
                'delay_between': getattr(self, 'delay_between', 2.0),
                'block_cooldown': getattr(self, 'block_cooldown', "3-7"),
                'max_retries': getattr(self, 'max_retries', 25)
            }

    def set_concurrency(self, concurrency):
        return self.set_config(concurrency=concurrency)['concurrency']

    def get_concurrency(self):
        return self.concurrency

    def set_attempt(self, dni, attempt_num):
        with self._lock:
            self.attempt_status[dni] = attempt_num

    def clear_attempt(self, dni):
        with self._lock:
            self.attempt_status.pop(dni, None)

    def get_attempts(self):
        with self._lock:
            return dict(self.attempt_status)

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
        # Debe cubrir el peor caso de la cadena completa de reintentos internos
        # (cada reintento implica una pausa de enfriamiento + reapertura de ventana + espera de respuesta)
        per_retry_budget = int(_max_seconds(getattr(self, 'block_cooldown', "3-7"))) + 25
        timeout_wait = max(120, (int(getattr(self, 'max_retries', 25)) + 1) * per_retry_budget)
        try:
            return res_queue.get(timeout=timeout_wait)
        except queue.Empty:
            return {
                'afiliado_spp': None,
                'afp': 'TIMEOUT SBS',
                'cuspp': '-',
                'fecha_afiliacion': '-',
                'situacion': 'TIMEOUT',
                'fecha_consulta': datetime.now().strftime('%d/%m/%Y %H:%M:%S'),
                'estado_sbs': 'TIMEOUT',
                'mensaje': 'Tiempo de consulta agotado',
                'tiempo_seg': timeout_wait
            }
        finally:
            self.clear_attempt(dni)

    def stop(self):
        """Cierra inmediatamente todos los navegadores y drena la cola de tareas"""
        # 1. Cancelar cualquier cooldown activo
        self.cooldown_until = 0

        # 2. Marcar de inmediato a todos los workers como interrumpidos (para que cualquier
        # ciclo de espera cooperativo corte de inmediato) y forzar el cierre a nivel de sistema
        # operativo de TODAS las ventanas Chromium de este servicio en un solo paso. Esto no
        # depende de atributos internos y frágiles de Playwright para hallar el proceso, así que
        # desbloquea de inmediato cualquier llamada síncrona (click/fill/goto) que estuviera
        # esperando una respuesta del navegador, en vez de esperar a que expire su propio timeout.
        with self._lock:
            for w in self.workers:
                w.interrupted = True
                w.running = False
                pid = getattr(w, 'driver_pid', None)
                if not pid and w.playwright and hasattr(w.playwright, '_impl_obj'):
                    try:
                        proc = getattr(w.playwright._impl_obj._connection._transport, '_proc', None)
                        if proc and proc.pid:
                            pid = proc.pid
                    except Exception:
                        pass
                if pid:
                    try:
                        subprocess.run(f'taskkill /F /T /PID {pid}', shell=True, capture_output=True)
                    except Exception:
                        pass

        kill_marked_chromium()

        # 3. Drenar la cola de tareas pendientes para que ningún request quede colgado
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

        # 4. Intento adicional best-effort sobre el proceso del driver de Playwright de cada
        # worker (por si acaso), y limpieza de referencias
        with self._lock:
            for w in self.workers:
                try:
                    w.close_browser()
                except Exception:
                    pass
                try:
                    if w.playwright and hasattr(w.playwright, '_impl_obj'):
                        proc = getattr(w.playwright._impl_obj._connection._transport, '_proc', None)
                        if proc and proc.pid:
                            subprocess.call(f'taskkill /F /T /PID {proc.pid}', shell=True)
                except Exception:
                    pass

                w.page = None
                w.context = None
                w.browser = None
                w.playwright = None
                w.is_ready = False

            # 5. Vaciar la lista y regenerar el pool limpio para permitir reanudar
            self.workers = []
            self._update_worker_pool(self.concurrency)

        return {'success': True, 'message': 'Todas las ventanas de Playwright fueron cerradas de inmediato.'}


def get_sbs_service():
    return SBSServiceManager.get_instance()

