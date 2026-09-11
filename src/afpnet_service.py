"""
Servicio Conector y Procesador Oficial para AFPNET (Portal de Empleadores de las AFP)
Permite:
1. Generación nativa de la plantilla Excel para Consulta Masiva de CUSPP (lotes <= 100 registros)
2. Lectura y cruce nativo del archivo de resultados descargado de AFPNET (res_prueba_*.xlsx)
3. Automatización con Playwright en modo visible con credenciales institucionales MPFN
"""
import os
import re
import time
import zipfile
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

AFPNET_LOGIN_URL = "https://www.afpnet.com.pe/"
AFPNET_MASIVA_URL = "https://www.afpnet.com.pe/GestionarAfiliado/Afiliado/ConsultaCusppMasiva"

# Credenciales institucionales del empleador MPFN
MPFN_RUC = "20131370301"
MPFN_USUARIO = "EMP0052"
MPFN_CLAVE = "Mpfn123*"

class AfpnetParser:
    """Parser nativo para el archivo de resultados descargado de AFPNET (.xlsx) sin dependencias externas"""
    
    @staticmethod
    def parse_result_file(file_path):
        """
        Lee el archivo de salida oficial de AFPNET (ej. res_prueba_1_consultaCUSPPMasiva.xlsx)
        y retorna un diccionario {dni: {datos_afpnet}}
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"No se encontró el archivo: {file_path}")

        results = {}
        
        with zipfile.ZipFile(file_path, 'r') as z:
            # 1. Cargar Shared Strings
            shared_strings = []
            if 'xl/sharedStrings.xml' in z.namelist():
                tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
                for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                    t = si.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                    if t is not None and t.text:
                        shared_strings.append(t.text)
                    else:
                        text = ''.join([elem.text for elem in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t') if elem.text])
                        shared_strings.append(text)

            # 2. Cargar Sheet1
            sheet_data = z.read('xl/worksheets/sheet1.xml')
            tree = ET.fromstring(sheet_data)
            rows = tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')

            for r in rows:
                r_num = r.get('r')
                if r_num == '1': # Cabecera
                    continue

                row_dict = {}
                for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                    ref = c.get('r')
                    col = ''.join(filter(str.isalpha, ref))
                    t = c.get('t')
                    v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                    val = v.text if v is not None else ''
                    if t == 's' and val.isdigit() and int(val) < len(shared_strings):
                        val = shared_strings[int(val)]
                    row_dict[col] = val.strip()

                dni = row_dict.get('B', '').strip()
                if not dni:
                    continue

                # Normalizar DNI a 8 dígitos
                if len(dni) < 8 and dni.isdigit():
                    dni = dni.zfill(8)

                cuspp = row_dict.get('F', '').strip() or '-'
                paterno = row_dict.get('G', '').strip()
                materno = row_dict.get('H', '').strip()
                nombres = row_dict.get('I', '').strip()
                devengue_max = row_dict.get('J', '').strip() or '-'
                ultimo_devengue = row_dict.get('L', '').strip() or '-'
                motivo_salida = row_dict.get('M', '').strip() or '-'
                tipo_comision = row_dict.get('N', '').strip() or '-'
                afp = row_dict.get('O', '').strip()
                pct_comision = row_dict.get('P', '').strip()

                # Normalizar estado de afiliación
                afiliado_spp = bool(afp and afp.upper() not in ['-', 'NO AFILIADO', ''])
                afp_nombre = afp.upper() if afp else 'NO REGISTRADO'

                results[dni] = {
                    'dni': dni,
                    'cuspp': cuspp,
                    'afp': afp_nombre,
                    'afiliado_spp': afiliado_spp,
                    'tipo_comision': tipo_comision,
                    'pct_comision': pct_comision,
                    'devengue_maximo': devengue_max,
                    'ultimo_devengue': ultimo_devengue,
                    'motivo_salida': motivo_salida,
                    'nombre_afpnet': f"{paterno} {materno} {nombres}".strip(),
                    'fuente': 'AFPNET'
                }

        return results

class AfpnetGenerator:
    """Generador nativo de la plantilla oficial de AFPNET (XML Spreadsheet 2003 / XLS)"""

    @staticmethod
    def generate_excel_xml(workers, limit=100):
        """
        Genera el archivo XML Spreadsheet 2003 con extensión .xls
        Compatible 100% con Microsoft Excel y con el uploader web de AFPNET.
        Columnas:
        1: Tipo de documento (0 = DNI)
        2: Número de documento (texto)
        3: Apellido paterno
        4: Apellido materno
        5: Nombres
        """
        selected_workers = workers[:limit] if limit else workers

        rows_xml = []
        for w in selected_workers:
            dni = str(w.get('dni', '')).strip()
            if len(dni) < 8 and dni.isdigit():
                dni = dni.zfill(8)
            
            paterno = escape(str(w.get('ape_paterno', '')).strip().upper())
            materno = escape(str(w.get('ape_materno', '')).strip().upper())
            primer_nom = str(w.get('primer_nombre', '')).strip().upper()
            segundo_nom = str(w.get('segundo_nombre', '')).strip().upper()
            nombres = escape(f"{primer_nom} {segundo_nom}".strip())

            row_str = f"""   <Row>
    <Cell><Data ss:Type="String">0</Data></Cell>
    <Cell><Data ss:Type="String">{dni}</Data></Cell>
    <Cell><Data ss:Type="String">{paterno}</Data></Cell>
    <Cell><Data ss:Type="String">{materno}</Data></Cell>
    <Cell><Data ss:Type="String">{nombres}</Data></Cell>
   </Row>"""
            rows_xml.append(row_str)

        all_rows = "\n".join(rows_xml)

        xml_template = f"""<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="Hoja1">
  <Table>
{all_rows}
  </Table>
 </Worksheet>
</Workbook>"""
        return xml_template.encode('utf-8')

    @staticmethod
    def generate_batches(workers, batch_size=100, output_dir=None):
        """
        Divide la nómina en lotes de hasta 100 registros (límite oficial de AFPNET para Devengue)
        Retorna lista de tuplas: (nombre_archivo, ruta_archivo, num_registros)
        """
        if output_dir is None:
            output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads')
        os.makedirs(output_dir, exist_ok=True)

        batches = []
        total = len(workers)
        for i in range(0, total, batch_size):
            chunk = workers[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            filename = f"Consulta_CUSPP_Masiva_Lote_{batch_num}.xls"
            filepath = os.path.join(output_dir, filename)
            
            xml_data = AfpnetGenerator.generate_excel_xml(chunk, limit=batch_size)
            with open(filepath, 'wb') as f:
                f.write(xml_data)
            
            batches.append({
                'lote': batch_num,
                'filename': filename,
                'filepath': filepath,
                'total': len(chunk),
                'rango': f"{i + 1} a {min(i + batch_size, total)}"
            })

        return batches

class AfpnetServiceManager:
    """Administrador de sesión y automatización de AFPNET mediante Playwright"""
    _instance = None

    def __init__(self):
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.is_logged_in = False

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = AfpnetServiceManager()
        return cls._instance

    def is_browser_alive(self):
        try:
            if not self.browser or not self.page:
                return False
            if not self.browser.is_connected() or self.page.is_closed():
                return False
            self.page.evaluate("() => true")
            return True
        except Exception:
            return False

    def open_login_browser(self, headless=False):
        """
        Abre el navegador en la pantalla del usuario en https://www.afpnet.com.pe/
        y pre-carga automáticamente RUC, Usuario y Contraseña del MPFN.
        """
        from playwright.sync_api import sync_playwright
        try:
            if not self.is_browser_alive():
                if not self.playwright:
                    self.playwright = sync_playwright().start()
                self.browser = self.playwright.chromium.launch(
                    headless=headless,
                    slow_mo=100 if not headless else 0,
                    args=["--start-maximized", "--window-position=80,80"]
                )
                self.context = self.browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    no_viewport=True,
                    accept_downloads=True
                )
                self.page = self.context.new_page()

            self.page.goto(AFPNET_LOGIN_URL, wait_until="domcontentloaded", timeout=30000)
            
            # Pre-cargar credenciales institucionales
            try:
                self.page.wait_for_selector("#NumeroDocumento", timeout=10000)
                self.page.fill("#NumeroDocumento", MPFN_RUC)
                self.page.fill("#NombreUsuario", MPFN_USUARIO)
                self.page.fill("#Contrasenia", MPFN_CLAVE)
                self.page.focus("#Captcha")
            except Exception as e:
                print(f"[AFPNET] Advertencia al pre-cargar credenciales: {e}")

            # Obtener imagen de captcha para mostrarla también en el frontend
            captcha_base64 = ""
            try:
                captcha_img = self.page.query_selector("#CaptchaImg")
                if captcha_img:
                    src = captcha_img.get_attribute("src")
                    if src and "base64," in src:
                        captcha_base64 = src.split("base64,")[1]
            except Exception:
                pass

            return {
                'success': True,
                'ruc': MPFN_RUC,
                'usuario': MPFN_USUARIO,
                'captcha_base64': captcha_base64,
                'mensaje': 'Navegador abierto con credenciales institucionales pre-cargadas.'
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def submit_login(self, captcha_text):
        """Envía el formulario de login con el captcha indicado"""
        try:
            if not self.is_browser_alive():
                return {'success': False, 'error': 'El navegador está cerrado.'}

            self.page.fill("#Captcha", captcha_text.strip())
            # Clic en INGRESAR
            btn_ingresar = self.page.query_selector("#btn-ingresar")
            if btn_ingresar:
                btn_ingresar.click()
            else:
                self.page.click("button:has-text('INGRESAR')")

            # Esperar navegación o mensaje de error
            time.sleep(2)
            current_url = self.page.url

            if "Sistema" in current_url or "Modulo" in current_url or self.page.query_selector("text=Bienvenido"):
                self.is_logged_in = True
                return {
                    'success': True,
                    'logged_in': True,
                    'url': current_url,
                    'mensaje': 'Sesión en AFPNET iniciada correctamente.'
                }
            else:
                # Comprobar si hubo error de captcha
                err_el = self.page.query_selector(".field-validation-error, .alert-danger, #mensajeError")
                err_text = err_el.inner_text() if err_el else "Captcha o credenciales inválidas. Reintente."
                return {
                    'success': False,
                    'logged_in': False,
                    'mensaje': err_text
                }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def navigate_to_consulta_masiva(self):
        """Navega en el menú lateral: Afiliados -> Consulta de Afiliados Masiva"""
        try:
            if not self.is_browser_alive():
                return {'success': False, 'error': 'Navegador desconectado'}

            # Opción directa por URL
            self.page.goto(AFPNET_MASIVA_URL, wait_until="domcontentloaded", timeout=25000)
            self.page.wait_for_timeout(1000)
            return {'success': True, 'url': self.page.url}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def close(self):
        try:
            if self.page: self.page.close()
            if self.context: self.context.close()
            if self.browser: self.browser.close()
            if self.playwright: self.playwright.stop()
        except Exception:
            pass
        finally:
            self.page = None
            self.context = None
            self.browser = None
            self.playwright = None
            self.is_logged_in = False

def get_afpnet_service():
    return AfpnetServiceManager.get_instance()
