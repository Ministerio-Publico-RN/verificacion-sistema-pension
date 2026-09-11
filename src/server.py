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
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

# Asegurar path de imports
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(BASE_DIR, 'src')
WEB_DIR = os.path.join(BASE_DIR, 'web')
DOCS_DIR = os.path.join(BASE_DIR, 'docs')

sys.path.insert(0, SRC_DIR)
from siga_parser import SigaParser
from sbs_service import get_sbs_service
from afpnet_service import AfpnetParser, AfpnetGenerator, get_afpnet_service

# Estado global en memoria para trabajadores activos
ACTIVE_STATE = {
    'workers': []
}

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class AppRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        # Log simplificado
        sys.stdout.write(f"[{self.log_date_time_string()}] {format % args}\n")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/status':
            self.send_json({'status': 'ok', 'app': 'MPFN Verificación Previsional', 'version': '1.0.0'})
        elif path == '/api/sbs/config':
            sbs = get_sbs_service()
            self.send_json(sbs.get_config())
        elif path == '/api/load-sample':
            self.handle_load_sample()
        elif path == '/api/afpnet/download-template':
            self.handle_afpnet_download_template(parsed.query)
        elif path == '/api/afpnet/batches-info':
            self.handle_afpnet_batches_info()
        else:
            # Servir archivos estáticos desde WEB_DIR
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/upload':
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
        else:
            self.send_error(404, "Endpoint no encontrado")

    def handle_sbs_set_config(self):
        """Actualiza la velocidad y modo de visibilidad del navegador Playwright"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            params = json.loads(body)
            concurrency = params.get('concurrency')
            headless = params.get('headless')
            sbs = get_sbs_service()
            res = sbs.set_config(concurrency=concurrency, headless=headless)
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

            sbs = get_sbs_service()
            result = sbs.query_worker(dni, ape_pat, ape_mat, primer_nom, segundo_nom)
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
                os.path.join(BASE_DIR, 'altas cas set 2026.DBF')
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
                'data': records
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
                
                # Extraer archivo del boundary
                parts = body.split(b'--' + boundary)
                file_data = None
                filename = "archivo_cargado.dbf"
                
                for part in parts:
                    if b'filename="' in part:
                        headers_part, content_part = part.split(b'\r\n\r\n', 1)
                        # Limpiar trailing CRLF
                        if content_part.endswith(b'\r\n'):
                            content_part = content_part[:-2]
                        file_data = content_part
                        
                        # Extraer nombre
                        m = re.search(r'filename="([^"]+)"', headers_part.decode('latin1', errors='ignore'))
                        if m:
                            filename = m.group(1)
                        break
                
                if not file_data:
                    self.send_json({'error': 'No se recibió ningún archivo en el formulario'}, status=400)
                    return

                # Guardar temporalmente en carpeta uploads
                uploads_dir = os.path.join(BASE_DIR, 'uploads')
                os.makedirs(uploads_dir, exist_ok=True)
                save_path = os.path.join(uploads_dir, filename)
                with open(save_path, 'wb') as f:
                    f.write(file_data)

                records = SigaParser.parse_file(save_path)
                ACTIVE_STATE['workers'] = records
                self.send_json({
                    'success': True,
                    'filename': filename,
                    'total': len(records),
                    'data': records
                })
            else:
                self.send_json({'error': 'Tipo de contenido no soportado. Use multipart/form-data'}, status=400)
        except Exception as e:
            self.send_json({'error': f"Error al procesar archivo: {str(e)}"}, status=500)

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
                    os.path.join(BASE_DIR, 'altas cas set 2026.DBF')
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

                uploads_dir = os.path.join(BASE_DIR, 'uploads')
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
                os.path.join(BASE_DIR, 'res_prueba_1_consultaCUSPPMasiva.xlsx')
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

def run_server(port=8080):
    os.makedirs(WEB_DIR, exist_ok=True)
    server_address = ('127.0.0.1', port)
    httpd = ThreadedHTTPServer(server_address, AppRequestHandler)
    print(f"===========================================================")
    print(f"  SISTEMA DE VERIFICACIÓN PREVISIONAL - MPFN")
    print(f"  Servidor local activo en: http://localhost:{port}")
    print(f"  Presione Ctrl+C para detener el servidor")
    print(f"===========================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nDeteniendo servidor...")
        httpd.server_close()

if __name__ == '__main__':
    port = 8080
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    run_server(port)
