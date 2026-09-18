"""
Servidor Web Local para el Sistema de Verificación Previsional (MPFN)
Utiliza ThreadingHTTPServer de la biblioteca estándar de Python (cero dependencias extra)
"""
import os
import sys
import re
import json
import mimetypes
import urllib.parse
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

# Asegurar path de imports (necesario en dev; inocuo en el .exe empaquetado, donde
# PyInstaller ya deja estos módulos importables directamente)
SRC_DIR = os.path.dirname(os.path.abspath(__file__))
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

from paths import resource_path, data_path, is_frozen
import browser_bootstrap  # debe ejecutarse antes de importar sbs_service (configura Playwright)

WEB_DIR = resource_path('web')
DOCS_DIR = resource_path('docs')

from siga_parser import SigaParser
from sbs_service import get_sbs_service
from afpnet_service import AfpnetParser, AfpnetGenerator, get_afpnet_service
import db
import updater

db.init_db()

# Estado global en memoria para trabajadores activos
ACTIVE_STATE = {
    'workers': []
}

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

class AppRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # Log simplificado
        sys.stdout.write(f"[{self.log_date_time_string()}] {format % args}\n")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        exec_match = re.match(r'^/api/executions/(\d+)$', path)

        if path == '/api/executions':
            self.handle_executions_list()
        elif exec_match:
            self.handle_execution_get(int(exec_match.group(1)))
        elif path == '/api/status':
            desktop_name = "unknown"
            try:
                import ctypes
                u = ctypes.windll.user32
                k = ctypes.windll.kernel32
                d = u.GetThreadDesktop(k.GetCurrentThreadId())
                buf = ctypes.create_unicode_buffer(256)
                u.GetUserObjectInformationW(d, 2, buf, 256, None)
                desktop_name = buf.value
            except Exception:
                pass
            self.send_json({'status': 'ok', 'app': 'MPFN Verificación Previsional', 'version': updater.CURRENT_VERSION, 'desktop': desktop_name})
        elif path == '/api/sbs/config':
            sbs = get_sbs_service()
            self.send_json(sbs.get_config())
        elif path == '/api/sbs/attempts':
            sbs = get_sbs_service()
            self.send_json({'attempts': sbs.get_attempts()})
        elif path == '/api/load-sample':
            self.handle_load_sample()
        elif path == '/api/afpnet/download-template':
            self.handle_afpnet_download_template(parsed.query)
        elif path == '/api/afpnet/batches-info':
            self.handle_afpnet_batches_info()
        elif path == '/api/app/check-update':
            self.send_json(updater.check_for_updates())
        else:
            # Servir archivos estáticos desde WEB_DIR
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ('/api/upload', '/api/parse-siga'):
            self.handle_upload()
        elif path == '/api/sbs/config':
            self.handle_sbs_set_config()
        elif path == '/api/sbs/verify-worker':
            self.handle_sbs_verify_worker()
        elif path == '/api/sbs/stop':
            self.handle_sbs_stop()
        elif path == '/api/afpnet/upload-result':
            self.handle_afpnet_upload_result()
        elif path == '/api/afpnet/load-sample-result':
            self.handle_afpnet_load_sample_result()
        elif path == '/api/afpnet/start-session':
            self.handle_afpnet_start_session()
        elif path == '/api/afpnet/submit-login':
            self.handle_afpnet_submit_login()
        elif path == '/api/afpnet/stop':
            self.handle_afpnet_stop()
        elif path == '/api/export-preview':
            self.handle_export_preview()
        elif path == '/api/executions':
            self.handle_execution_create()
        elif re.match(r'^/api/executions/(\d+)/status$', path):
            self.handle_execution_status(int(re.match(r'^/api/executions/(\d+)/status$', path).group(1)))
        elif path == '/api/afpnet/export-afiliacion':
            self.handle_afpnet_export_afiliacion()
        elif path == '/api/app/apply-update':
            self.handle_apply_update()
        elif path == '/api/app/finalize-update':
            self.handle_finalize_update()
        else:
            self.send_error(404, "Endpoint no encontrado")

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        exec_match = re.match(r'^/api/executions/(\d+)$', path)
        if exec_match:
            self.handle_execution_delete(int(exec_match.group(1)))
        else:
            self.send_error(404, "Endpoint no encontrado")

    def handle_apply_update(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            params = json.loads(body) if body else {}
            download_url = params.get('download_url')
            res = updater.apply_update(download_url)
            self.send_json(res)
        except Exception as e:
            self.send_json({'success': False, 'message': f"Error al aplicar actualización: {str(e)}"}, status=500)

    def handle_finalize_update(self):
        try:
            res = updater.finalize_and_exit()
            self.send_json(res)
        except Exception as e:
            self.send_json({'success': False, 'message': f"Error al finalizar actualización: {str(e)}"}, status=500)

    def handle_executions_list(self):
        try:
            self.send_json({'success': True, 'executions': db.list_executions()})
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_execution_get(self, execution_id):
        try:
            execution = db.get_execution(execution_id)
            if not execution:
                self.send_json({'error': 'Ejecución no encontrada'}, status=404)
                return
            self.send_json({'success': True, **execution})
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_execution_create(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            params = json.loads(body)
            tipo = params.get('tipo', 'altas')
            archivos = params.get('archivos', [])
            workers = params.get('workers', [])
            execution_id = db.create_execution(tipo, archivos, workers)
            ACTIVE_STATE['workers'] = workers
            self.send_json({'success': True, 'execution_id': execution_id})
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_execution_status(self, execution_id):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            params = json.loads(body)
            estado = params.get('estado', 'en_curso')
            db.update_status(execution_id, estado)
            self.send_json({'success': True})
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_execution_delete(self, execution_id):
        try:
            db.delete_execution(execution_id)
            self.send_json({'success': True})
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_sbs_set_config(self):
        """Actualiza la velocidad, modo de visibilidad y tiempos de espera del servicio SBS"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            params = json.loads(body)
            concurrency = params.get('concurrency')
            headless = params.get('headless')
            delay_between = params.get('delay_between')
            block_cooldown = params.get('block_cooldown')
            max_retries = params.get('max_retries')
            sbs = get_sbs_service()
            res = sbs.set_config(
                concurrency=concurrency,
                headless=headless,
                delay_between=delay_between,
                block_cooldown=block_cooldown,
                max_retries=max_retries
            )
            self.send_json({'success': True, **res})
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_sbs_verify_worker(self):
        """Consulta un trabajador específico contra la SBS"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            params = json.loads(body)

            dni = params.get('dni', '')
            ape_pat = params.get('ape_paterno', '')
            ape_mat = params.get('ape_materno', '')
            primer_nom = params.get('primer_nombre', '')
            segundo_nom = params.get('segundo_nombre', '')
            execution_id = params.get('execution_id')

            sbs = get_sbs_service()
            result = sbs.query_worker(dni, ape_pat, ape_mat, primer_nom, segundo_nom)
            if isinstance(result, dict) and not result.get('fecha_consulta'):
                result['fecha_consulta'] = datetime.now().strftime('%d/%m/%Y %H:%M:%S')

            if execution_id and dni:
                try:
                    # Una consulta CANCELADA (detenida a mitad de camino) no cuenta como
                    # consultada: debe quedar pendiente para la próxima "Continuar ejecución".
                    fue_cancelada = result.get('estado_sbs') == 'CANCELADO'
                    db.merge_worker(execution_id, dni, {'sbs_resultado': result, 'sbs_consultado': not fue_cancelada})
                except Exception:
                    pass

            self.send_json(result)
        except Exception as e:
            self.send_json({'error': f"Error en consulta SBS: {str(e)}"}, status=500)

    def handle_sbs_stop(self):
        """Libera la sesión del navegador Playwright de inmediato"""
        try:
            sbs = get_sbs_service()
            res = sbs.stop()
            self.send_json(res)
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_load_sample(self):
        """Carga automáticamente el archivo de prueba altas cas set 2026.DBF"""
        try:
            # Buscar en posibles ubicaciones
            candidates = [
                os.path.join(DOCS_DIR, 'archivos_pruebas', 'altas cas set 2026.DBF'),
                os.path.join(DOCS_DIR, 'altas cas set 2026.DBF'),
                resource_path('altas cas set 2026.DBF')
            ]
            target = None
            for c in candidates:
                if os.path.exists(c):
                    target = c
                    break
            
            if not target:
                self.send_json({'error': 'No se encontró el archivo de prueba DBF en docs/'}, status=404)
                return

            records = SigaParser.parse_file(target)
            ACTIVE_STATE['workers'] = records
            filename = os.path.basename(target)
            self.send_json({
                'success': True,
                'filename': filename,
                'filepath': target,
                'total': len(records),
                'data': records,
                'workers': records
            })
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_upload(self):
        """Maneja la subida de un archivo DBF o CSV mediante multipart/form-data o raw body"""
        try:
            content_type = self.headers.get('Content-Type', '')
            content_length = int(self.headers.get('Content-Length', 0))
            
            if 'multipart/form-data' in content_type:
                # Parse multipart
                boundary = content_type.split("boundary=")[1].encode()
                body = self.rfile.read(content_length)
                
                # Extraer archivo y campo opcional "origen" del boundary
                parts = body.split(b'--' + boundary)
                file_data = None
                filename = "archivo_cargado.dbf"
                origen = None

                for part in parts:
                    if b'\r\n\r\n' not in part:
                        continue
                    headers_part, content_part = part.split(b'\r\n\r\n', 1)
                    if content_part.endswith(b'\r\n'):
                        content_part = content_part[:-2]

                    if b'filename="' in headers_part:
                        file_data = content_part
                        m = re.search(r'filename="([^"]+)"', headers_part.decode('latin1', errors='ignore'))
                        if m:
                            filename = m.group(1)
                    elif b'name="origen"' in headers_part:
                        origen = content_part.decode('utf-8', errors='ignore').strip() or None

                if not file_data:
                    self.send_json({'error': 'No se recibió ningún archivo en el formulario'}, status=400)
                    return

                # Guardar temporalmente en carpeta uploads
                uploads_dir = data_path('uploads')
                os.makedirs(uploads_dir, exist_ok=True)
                save_path = os.path.join(uploads_dir, filename)
                with open(save_path, 'wb') as f:
                    f.write(file_data)

                records = SigaParser.parse_file(save_path, origen=origen)
                if not records:
                    self.send_json({
                        'error': f"El archivo '{filename}' no es compatible. No contiene registros con números de documento (DNI) válidos ni las columnas esperadas para Altas o PEA.",
                        'filename': filename,
                        'compatible': False,
                        'total': 0,
                        'workers': []
                    }, status=400)
                    return

                ACTIVE_STATE['workers'] = records
                self.send_json({
                    'success': True,
                    'filename': filename,
                    'origen': origen,
                    'total': len(records),
                    'data': records,
                    'workers': records
                })
            else:
                self.send_json({'error': 'Tipo de contenido no soportado. Use multipart/form-data'}, status=400)
        except Exception as e:
            self.send_json({'error': f"El archivo subido no es compatible o está dañado: {str(e)}"}, status=400)

    def handle_afpnet_download_template(self, query_str):
        """Genera y descarga la plantilla XLS oficial de AFPNET para la nómina actual"""
        try:
            params = urllib.parse.parse_qs(query_str)
            lote = params.get('lote', ['1'])[0]
            
            workers = ACTIVE_STATE['workers']
            if not workers:
                candidates = [
                    os.path.join(DOCS_DIR, 'archivos_pruebas', 'altas cas set 2026.DBF'),
                    os.path.join(DOCS_DIR, 'altas cas set 2026.DBF'),
                    resource_path('altas cas set 2026.DBF')
                ]
                for c in candidates:
                    if os.path.exists(c):
                        workers = SigaParser.parse_file(c)
                        ACTIVE_STATE['workers'] = workers
                        break

            if not workers:
                self.send_json({'error': 'No hay trabajadores cargados para generar la plantilla.'}, status=400)
                return

            if lote == 'all':
                chunk = workers
                filename = f"Consulta_CUSPP_Masiva_Completo_{len(chunk)}_registros.xls"
            elif lote == '2':
                chunk = workers[100:200]
                filename = f"Consulta_CUSPP_Masiva_Lote_2_{len(chunk)}_registros.xls"
            else:
                chunk = workers[:100]
                filename = f"Consulta_CUSPP_Masiva_Lote_1_{len(chunk)}_registros.xls"

            xml_data = AfpnetGenerator.generate_excel_xml(chunk, limit=len(chunk))
            self.send_file_download(xml_data, filename)
        except Exception as e:
            self.send_json({'error': f"Error al generar plantilla AFPNET: {str(e)}"}, status=500)

    def handle_afpnet_export_afiliacion(self):
        """Genera y descarga el archivo oficial de Afiliación Masiva en formato Carga_Masiva_Ejemplo_Empl.xls"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            params = json.loads(body) if body else {}
            workers = params.get('workers')
            if not workers:
                workers = ACTIVE_STATE.get('workers', [])
                sin_afiliados = [w for w in workers if w.get('semaforo') == 'sin_afiliacion']
                if sin_afiliados:
                    workers = sin_afiliados

            if not workers:
                self.send_json({'error': 'No hay trabajadores para generar el reporte de afiliación.'}, status=400)
                return

            from afpnet_afiliacion_generator import generate_afiliacion_excel
            output_file = generate_afiliacion_excel(workers)

            with open(output_file, 'rb') as f:
                file_bytes = f.read()

            filename = os.path.basename(output_file)
            self.send_response(200)
            self.send_header('Content-Type', 'application/vnd.ms-excel')
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
            self.send_header('Content-Length', str(len(file_bytes)))
            self.end_headers()
            self.wfile.write(file_bytes)
        except Exception as e:
            self.send_json({'error': f"Error al generar reporte oficial de afiliación: {str(e)}"}, status=500)

    def handle_afpnet_batches_info(self):
        """Retorna la información de lotes para AFPNET"""
        workers = ACTIVE_STATE['workers']
        batches = AfpnetGenerator.generate_batches(workers, batch_size=100) if workers else []
        self.send_json({
            'success': True,
            'total_workers': len(workers),
            'batches': batches
        })

    def handle_afpnet_upload_result(self):
        """Procesa el archivo de resultados descargado de AFPNET (.xlsx) subido por el usuario"""
        try:
            content_type = self.headers.get('Content-Type', '')
            content_length = int(self.headers.get('Content-Length', 0))

            if 'multipart/form-data' in content_type:
                boundary = content_type.split("boundary=")[1].encode()
                body = self.rfile.read(content_length)
                parts = body.split(b'--' + boundary)
                file_data = None
                filename = "res_afpnet.xlsx"
                for part in parts:
                    if b'filename="' in part:
                        headers_part, content_part = part.split(b'\r\n\r\n', 1)
                        if content_part.endswith(b'\r\n'):
                            content_part = content_part[:-2]
                        file_data = content_part
                        m = re.search(r'filename="([^"]+)"', headers_part.decode('latin1', errors='ignore'))
                        if m: filename = m.group(1)
                        break

                if not file_data:
                    self.send_json({'error': 'No se recibió ningún archivo Excel.'}, status=400)
                    return

                uploads_dir = data_path('uploads')
                os.makedirs(uploads_dir, exist_ok=True)
                save_path = os.path.join(uploads_dir, filename)
                with open(save_path, 'wb') as f:
                    f.write(file_data)

                results = AfpnetParser.parse_result_file(save_path)
                self.send_json({
                    'success': True,
                    'filename': filename,
                    'total': len(results),
                    'data': results
                })
            else:
                self.send_json({'error': 'Use multipart/form-data'}, status=400)
        except Exception as e:
            self.send_json({'error': f"Error al procesar archivo de AFPNET: {str(e)}"}, status=500)

    def handle_afpnet_load_sample_result(self):
        """Carga automáticamente el archivo de prueba oficial docs/archivos_pruebas/res_prueba_1_consultaCUSPPMasiva.xlsx"""
        try:
            candidates = [
                os.path.join(DOCS_DIR, 'archivos_pruebas', 'res_prueba_1_consultaCUSPPMasiva.xlsx'),
                os.path.join(DOCS_DIR, 'res_prueba_1_consultaCUSPPMasiva.xlsx'),
                resource_path('res_prueba_1_consultaCUSPPMasiva.xlsx')
            ]
            target = None
            for c in candidates:
                if os.path.exists(c):
                    target = c
                    break

            if not target:
                self.send_json({'error': 'No se encontró el archivo de prueba res_prueba_1_consultaCUSPPMasiva.xlsx'}, status=404)
                return

            results = AfpnetParser.parse_result_file(target)
            self.send_json({
                'success': True,
                'filename': 'res_prueba_1_consultaCUSPPMasiva.xlsx',
                'total': len(results),
                'data': results
            })
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def handle_afpnet_start_session(self):
        """Abre la ventana visible de Chromium en el login de AFPNET con credenciales institucionales"""
        try:
            afp = get_afpnet_service()
            res = afp.open_login_browser(headless=False)
            self.send_json(res)
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, status=500)

    def handle_afpnet_submit_login(self):
        """Envía el captcha para iniciar sesión y navega a Consulta Masiva"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            params = json.loads(body)
            captcha_text = params.get('captcha', '')

            afp = get_afpnet_service()
            login_res = afp.submit_login(captcha_text)
            if login_res.get('logged_in'):
                nav_res = afp.navigate_to_consulta_masiva()
                login_res['masiva_url'] = nav_res.get('url')
            self.send_json(login_res)
        except Exception as e:
            self.send_json({'success': False, 'error': str(e)}, status=500)

    def handle_afpnet_stop(self):
        try:
            get_afpnet_service().close()
            self.send_json({'success': True, 'message': 'Sesión AFPNET cerrada'})
        except Exception as e:
            self.send_json({'error': str(e)}, status=500)

    def send_file_download(self, data, filename, content_type='application/vnd.ms-excel'):
        self.send_response(200)
        self.send_header('Content-Type', f'{content_type}; charset=utf-8')
        self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

def run_server(port=8080, open_browser=False):
    os.makedirs(WEB_DIR, exist_ok=True)
    server_address = ('127.0.0.1', port)
    
    httpd = None
    import time
    for attempt in range(1, 11):
        try:
            httpd = ThreadedHTTPServer(server_address, AppRequestHandler)
            break
        except OSError as e:
            if attempt < 10:
                print(f"Puerto {port} ocupado o socket previo cerrando, reintentando en 500ms ({attempt}/10)...")
                time.sleep(0.5)
            else:
                raise e

    print(f"===========================================================")
    print(f"  SISTEMA DE VERIFICACIÓN PREVISIONAL - MPFN")
    print(f"  Servidor local activo en: http://localhost:{port}")
    print(f"  Presione Ctrl+C para detener el servidor")
    print(f"===========================================================")

    if open_browser:
        import threading
        import webbrowser
        threading.Timer(0.6, lambda: webbrowser.open(f'http://localhost:{port}')).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nDeteniendo servidor...")
        httpd.server_close()

if __name__ == '__main__':
    port = 8080
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    # El .exe empaquetado no tiene un .bat que abra el navegador por fuera,
    # así que lo hace él mismo. En modo desarrollo se mantiene el flujo actual
    # (el .bat es quien abre el navegador).
    run_server(port, open_browser=is_frozen())
