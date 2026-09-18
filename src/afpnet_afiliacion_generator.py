"""
Generador del Reporte de Afiliación Masiva para AFPnet
Utiliza la plantilla oficial Carga_Masiva_Ejemplo_Empl.xls manteniendo
sus 5 hojas y las 3 filas de cabecera/instrucciones intactas, insertando
los datos de los trabajadores a partir de la fila 4.
"""
import os
import sys
import json
import re
import unicodedata
from datetime import datetime

try:
    from paths import resource_path, data_path
except ImportError:
    from src.paths import resource_path, data_path

def strip_accents(text):
    if not text:
        return ''
    return ''.join(c for c in unicodedata.normalize('NFD', str(text)) if unicodedata.category(c) != 'Mn').upper().strip()

UBI_MAP = {}
UBI_LIST = []

def _init_ubigeos():
    global UBI_MAP, UBI_LIST
    if UBI_MAP:
        return
    candidates = [
        resource_path('src', 'ubigeos_afpnet.json'),
        resource_path('ubigeos_afpnet.json'),
        os.path.join(os.path.dirname(__file__), 'ubigeos_afpnet.json')
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                with open(p, 'r', encoding='utf-8-sig') as f:
                    UBI_LIST = json.load(f)
                    for u in UBI_LIST:
                        k = (strip_accents(u.get('d', '')), strip_accents(u.get('p', '')), strip_accents(u.get('di', '')))
                        UBI_MAP[k] = str(u.get('u', '')).zfill(6)
                break
            except Exception as e:
                sys.stderr.write(f"[AFPNET] Error cargando ubigeos desde {p}: {e}\n")

def resolve_ubigeo(dep, prov, dist):
    _init_ubigeos()
    if not dep or not dist:
        return ''
    d = strip_accents(dep)
    p = strip_accents(prov)
    di = strip_accents(dist)
    if (d, p, di) in UBI_MAP:
        return UBI_MAP[(d, p, di)]
    for u in UBI_LIST:
        if strip_accents(u.get('d', '')) == d and strip_accents(u.get('p', '')) == p:
            udi = strip_accents(u.get('di', ''))
            if udi.startswith(di) or di.startswith(udi):
                return str(u.get('u', '')).zfill(6)
    return ''

def parse_address(addr):
    if not addr:
        return ('', '', '', '')
    addr_u = str(addr).upper().strip()
    tipo_via, nom_via, tipo_loc, nom_loc = '', '', '', ''
    m_via = re.match(r'^(JIR[OÓ]N|JR\.?|CALLE|CL\.?|AVENIDA|AV\.?|PASAJE|PSJE\.?|PROLONGACI[OÓ]N|PROL\.?|CARRETERA|CARR\.?)\s+(.*?)(?:,|$|\s+(?:URB|ASOC|AAHH|A\.A\.H\.H\.|COOP|PPJJ)\b)', addr_u)
    if m_via:
        prefix = m_via.group(1)
        if 'JIR' in prefix or 'JR' in prefix: tipo_via = '01'
        elif 'CAL' in prefix or 'CL' in prefix: tipo_via = '02'
        elif 'AV' in prefix: tipo_via = '03'
        elif 'PAS' in prefix or 'PSJ' in prefix: tipo_via = '04'
        elif 'CARR' in prefix: tipo_via = '05'
        elif 'PROL' in prefix: tipo_via = '06'
        nom_via = m_via.group(2).strip()
    m_loc = re.search(r'\b(URB\.?|URBANIZACI[OÓ]N|A\.A\.H\.H\.?|AAHH|ASOC\.?|ASOCIACI[OÓ]N|COOP\.?|COOPERATIVA|PP\.?JJ\.?)\s+(.*)$', addr_u)
    if m_loc:
        l_pref = m_loc.group(1)
        if 'URB' in l_pref: tipo_loc = '01'
        elif 'AAHH' in l_pref or 'A.A' in l_pref: tipo_loc = '02'
        elif 'PP' in l_pref: tipo_loc = '03'
        elif 'ASOC' in l_pref: tipo_loc = '04'
        elif 'COOP' in l_pref: tipo_loc = '05'
        nom_loc = m_loc.group(2).strip()
    return (tipo_via, nom_via, tipo_loc, nom_loc)

def format_date_dmy(date_val):
    if not date_val:
        return ''
    s = str(date_val).strip()
    if re.match(r'^\d{2}/\d{2}/\d{4}$', s):
        return s
    m = re.match(r'^(\d{4})[-/](\d{2})[-/](\d{2})$', s)
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    m2 = re.match(r'^(\d{4})(\d{2})(\d{2})$', s)
    if m2:
        return f"{m2.group(3)}/{m2.group(2)}/{m2.group(1)}"
    return s

def worker_to_row(w):
    dni = str(w.get('dni', '')).strip()
    if len(dni) < 8 and dni.isdigit():
        dni = dni.zfill(8)
    
    paterno = str(w.get('ape_paterno', '')).strip().upper()
    materno = str(w.get('ape_materno', '')).strip().upper()
    nombres = str(w.get('nombres', '')).strip().upper()
    if not nombres:
        p1 = str(w.get('primer_nombre', '')).strip().upper()
        p2 = str(w.get('segundo_nombre', '')).strip().upper()
        nombres = f"{p1} {p2}".strip()

    if not paterno and not materno and (w.get('apellidos_nombres') or w.get('nombre_completo')):
        full = (w.get('apellidos_nombres') or w.get('nombre_completo')).strip()
        if ',' in full:
            apels, noms = full.split(',', 1)
            parts = apels.strip().split()
            paterno = parts[0] if parts else ''
            materno = ' '.join(parts[1:]) if len(parts) > 1 else ''
            nombres = noms.strip().upper()
        else:
            parts = full.split()
            if len(parts) >= 3:
                paterno = parts[0]
                materno = parts[1]
                nombres = ' '.join(parts[2:])
            elif parts:
                paterno = parts[0]
                nombres = ' '.join(parts[1:])

    raw = w.get('raw_data', {}) if isinstance(w.get('raw_data'), dict) else {}
    fec_nac = format_date_dmy(w.get('fecha_nacimiento') or raw.get('NACIM'))
    email = str(w.get('email', '') or raw.get('DIRE_EMAI_') or raw.get('EMAIL_MPFN') or raw.get('EMAIL') or raw.get('CORREO') or '').strip()
    celular = str(w.get('celular', '') or raw.get('CELULAR') or raw.get('MOVIL') or raw.get('TELEFONO') or '').strip()
    tel_fijo = str(w.get('telefono_fijo', '') or raw.get('TELEFONO_FIJO') or '').strip()

    dep = raw.get('DEPARTAMEN', '')
    prov = raw.get('PROVINCIA', '')
    dist = raw.get('DISTRITO', '')
    ubigeo = str(w.get('ubigeo', '') or raw.get('UBIGEO') or resolve_ubigeo(dep, prov, dist)).strip()

    direccion = raw.get('DIRECCION', '')
    tipo_via, nom_via, tipo_loc, nom_loc = parse_address(direccion)

    prev = str(w.get('previsional_siga', '') or w.get('regimen_siga', '') or '').upper()
    origen_onp = '1' if ('SNP' in prev or 'ONP' in prev or '19990' in prev) else '0'

    return [
        '0',                                   # 1: Tipo de documento de identidad
        dni,                                   # 2: Número de Documento de Identidad
        nombres,                               # 3: Nombres
        paterno,                               # 4: Apellido Paterno
        materno,                               # 5: Apellido Materno
        fec_nac,                               # 6: Fecha de Nacimiento
        email,                                 # 7: Mail Principal
        tel_fijo,                              # 8: Teléfono Fijo
        celular,                               # 9: Teléfono Móvil
        ubigeo,                                # 10: Ubigeo
        tipo_via,                              # 11: Tipo Vía
        nom_via,                               # 12: Nombre Vía
        tipo_loc,                              # 13: Tipo Localidad
        nom_loc,                               # 14: Nombre Localidad
        '20131370301',                         # 15: RUC
        'MINISTERIO PUBLICO-GERENCIA GENERAL',  # 16: Razón Social
        '',                                    # 17: Usuario Agente
        origen_onp                             # 18: Origen ONP (0 = Primer Trabajo, 1 = ONP)
    ]

def generate_afiliacion_excel(workers, output_path=None):
    """
    Genera el archivo .xls en formato oficial para Afiliación Masiva en AFPnet.
    En la primera hoja 'Excel', elimina las filas 1 y 3 del modelo original:
    - Fila 1 (índice 0): Cabeceras oficiales (las 18 columnas).
    - Fila 2 (índice 1) en adelante: Datos de los trabajadores.
    Mantiene intactas las otras 4 hojas oficiales de referencia (Texto, Ubigeos, Tipo Vía, Tipo Localidad).
    """
    if not workers:
        raise ValueError("No hay trabajadores para generar el reporte de afiliación.")

    # 1. Ubicar la plantilla oficial en posibles rutas relativas y de PyInstaller
    candidates = [
        resource_path('docs', 'templates', 'Carga_Masiva_Ejemplo_Empl.xls'),
        resource_path('docs', 'archivos_pruebas', 'Carga_Masiva_Ejemplo_Empl.xls'),
        resource_path('templates', 'Carga_Masiva_Ejemplo_Empl.xls'),
        resource_path('Carga_Masiva_Ejemplo_Empl.xls'),
        data_path('docs', 'templates', 'Carga_Masiva_Ejemplo_Empl.xls'),
        data_path('Carga_Masiva_Ejemplo_Empl.xls'),
        os.path.join(os.path.dirname(__file__), '..', 'docs', 'templates', 'Carga_Masiva_Ejemplo_Empl.xls'),
        os.path.join(os.path.dirname(__file__), 'Carga_Masiva_Ejemplo_Empl.xls'),
        'D:\\Descargas\\Carga_Masiva_Ejemplo_Empl.xls'
    ]
    template_path = None
    for c in candidates:
        if c and os.path.exists(c):
            template_path = os.path.abspath(c)
            break

    if not template_path:
        raise FileNotFoundError("No se encontró la plantilla oficial Carga_Masiva_Ejemplo_Empl.xls en el sistema.")

    # 2. Preparar ruta de salida
    if not output_path:
        uploads_dir = data_path('uploads')
        os.makedirs(uploads_dir, exist_ok=True)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_path = os.path.join(uploads_dir, f"Carga_Masiva_Afiliacion_AFPnet_{timestamp}.xls")
    output_path = os.path.abspath(output_path)

    # 3. Leer la plantilla oficial
    import xlrd
    import xlwt

    rb = xlrd.open_workbook(template_path, formatting_info=True)
    wb = xlwt.Workbook(encoding='utf-8')

    # 4. Crear la hoja 'Excel' limpia (sin filas 1 y 3 de guía)
    s0 = wb.add_sheet('Excel')
    src_sheet0 = rb.sheet_by_index(0)

    # Fila 1 (índice 0): Encabezados oficiales de las 18 columnas (extraídos de la fila 2 del modelo)
    headers = [src_sheet0.cell_value(1, c) for c in range(18)]
    for col_idx, h in enumerate(headers):
        s0.write(0, col_idx, str(h) if h is not None else '')

    # Fila 2 (índice 1) en adelante: Registros de trabajadores
    for row_idx, w in enumerate(workers):
        target_row = 1 + row_idx
        row_cells = worker_to_row(w)
        for col_idx, val in enumerate(row_cells):
            s0.write(target_row, col_idx, str(val) if val is not None else '')

    # 5. Copiar las otras 4 hojas de referencia tal cual están en la plantilla original
    for sheet_idx in range(1, rb.nsheets):
        src_sheet = rb.sheet_by_index(sheet_idx)
        dst_sheet = wb.add_sheet(src_sheet.name)
        for r in range(src_sheet.nrows):
            for c in range(src_sheet.ncols):
                dst_sheet.write(r, c, src_sheet.cell_value(r, c))

    # 6. Guardar archivo final
    wb.save(output_path)

    if not os.path.exists(output_path) or os.path.getsize(output_path) < 1000:
        raise RuntimeError("El archivo generado no es válido o está vacío.")

    return output_path

