"""
Módulo de parseo e ingesta de archivos de trabajadores del SIGA (MPFN)
Soporta archivos .DBF (dBase III / FoxPro del SIGA), .xlsx, .xls y .csv
"""
import os
import re
import csv
import struct
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

MOJIBAKE_MAP = {
    '┴': 'Á',
    '╔': 'É',
    '═': 'Í',
    'Ë': 'Ó',
    '┌': 'Ú',
    'Ð': 'Ñ',
    'ð': 'ñ',
    '±': 'ñ',
    '¾': 'ó',
    '²': 'ó',
    '║': 'º',
    'Ã¡': 'á',
    'Ã©': 'é',
    'Ã\xad': 'í',
    'Ã³': 'ó',
    'Ãº': 'ú',
    'Ã±': 'ñ',
    'Ã\x81': 'Á',
    'Ã\x89': 'É',
    'Ã\x8d': 'Í',
    'Ã\x93': 'Ó',
    'Ã\x9a': 'Ú',
    'Ã\x91': 'Ñ',
    'Ã¼': 'ü',
    'Ã\x9c': 'Ü'
}

def clean_mojibake(val):
    if not isinstance(val, str):
        return val
    for bad, good in MOJIBAKE_MAP.items():
        if bad in val:
            val = val.replace(bad, good)
    return val.strip()

def parse_date_to_dmy(raw_val):
    if not raw_val:
        return ''
    s = str(raw_val).strip()
    if 'T' in s:
        s = s.split('T')[0]
    elif ' ' in s and ':' in s:
        s = s.split(' ')[0]
    
    # 1. Número serial de días de Excel (ej: 35907 -> 22/04/1998)
    try:
        num = float(s)
        if 1000 <= num <= 80000:
            dt = datetime(1899, 12, 30) + timedelta(days=num)
            return dt.strftime('%d/%m/%Y')
    except (ValueError, OverflowError):
        pass

    # 2. 8 dígitos consecutivos (ej: 19980422 o 22041998)
    if len(s) == 8 and s.isdigit():
        y1, y2 = int(s[0:4]), int(s[4:8])
        if 1900 <= y1 <= 2050:
            return f"{s[6:8]}/{s[4:6]}/{s[0:4]}"
        elif 1900 <= y2 <= 2050:
            return f"{s[0:2]}/{s[2:4]}/{s[4:8]}"

    # 3. Fechas separadas por guiones o barras
    if '-' in s or '/' in s:
        sep = '-' if '-' in s else '/'
        parts = [p.strip() for p in s.split(sep)]
        if len(parts) == 3:
            p0, p1, p2 = parts[0], parts[1], parts[2]
            if len(p0) == 4:
                return f"{p2.zfill(2)}/{p1.zfill(2)}/{p0}"
            elif len(p2) == 4:
                return f"{p0.zfill(2)}/{p1.zfill(2)}/{p2}"

    return s

AFP_CODE_MAP = {'02': 'PROFUTURO', '03': 'INTEGRA', '05': 'PRIMA', '06': 'HABITAT'}
SNP_REGI_CODES = {'19990', 'E-19990'}
EXONERADO_CODES = {'E-AFP', 'EXONERA', 'E-CM'}
AFP_NAMES = ('HABITAT', 'INTEGRA', 'PRIMA', 'PROFUTURO')


def split_regimen_previsional(previsiona_siga):
    """
    Separa el texto combinado de 'previsiona_siga' (que junta régimen previsional
    y entidad previsional en un solo valor, ej. "SNP (ONP) - D.L. 19990" o "HABITAT")
    en dos datos independientes para mostrarlos en columnas separadas:
    Régimen (SPP / SNP / Régimen especial) y Previsional (AFP específica u ONP).
    """
    text = (previsiona_siga or '').strip()
    upper = text.upper()

    if not text or upper in ('-', 'SIN', 'SIN REGISTRO'):
        return '', ''

    exonerado = ' (Exonerado de aporte)' if 'EXONERA' in upper else ''

    for afp in AFP_NAMES:
        if afp in upper:
            return f'SPP{exonerado}', afp

    if 'ONP' in upper or 'SNP' in upper or '19990' in upper:
        return f'SNP{exonerado}', 'ONP'

    if '20530' in upper or 'ESPECIAL' in upper:
        return 'RÉGIMEN ESPECIAL D.L. 20530', '-'

    return text, '-'


def resolve_previsiona_pea(regi_pens, codi_afps):
    """
    Resuelve el régimen previsional SIGA para el esquema de "Planilla PEA"
    (columnas REGI_PENS_ / CODI_AFPS_ con códigos, en vez de un texto libre).
    Reglas confirmadas por el MPFN:
      - Está en AFP si CODI_AFPS_ trae un código (02/03/05/06), sin importar REGI_PENS_.
        Si además REGI_PENS_ es E-AFP/EXONERA/E-CM, sigue en esa AFP pero exonerado de aportar.
      - Está en SNP solo si CODI_AFPS_ está vacío y REGI_PENS_ es 19990 (aporta) o E-19990 (exonerado).
      - REGI_PENS_ = 20530 (régimen especial / Cédula Viva) tampoco figura en SBS, se trata igual que SNP.
      - En blanco (sin código de AFP ni régimen) equivale a SNP/exonerado en este reporte cerrado de PEA.
    """
    afp_name = AFP_CODE_MAP.get((codi_afps or '').strip())
    regi = (regi_pens or '').strip().upper()

    if afp_name:
        return f"{afp_name} (Exonerado de aporte)" if regi in EXONERADO_CODES else afp_name

    if regi in SNP_REGI_CODES:
        exon = " (Exonerado de aporte)" if regi == 'E-19990' else ""
        return f"SNP (ONP) - D.L. 19990{exon}"

    if regi == '20530':
        return "RÉGIMEN ESPECIAL D.L. 20530"

    if not regi:
        return "SNP (ONP) / EXONERADO"

    return regi


class SigaParser:
    @staticmethod
    def read_dbf(filepath, origen=None):
        """
        Lee directamente la estructura binaria de un archivo DBF de dBase III / FoxPro
        sin requerir librerías externas pesadas.
        """
        with open(filepath, 'rb') as f:
            header = f.read(32)
            if len(header) < 32:
                raise ValueError("Archivo DBF corrupto o incompleto.")
            
            num_records = int.from_bytes(header[4:8], 'little')
            header_len = int.from_bytes(header[8:10], 'little')
            record_len = int.from_bytes(header[10:12], 'little')
            
            f.seek(32)
            fields = []
            while True:
                field_desc = f.read(32)
                if not field_desc or field_desc[0] == 0x0D:
                    break
                name = field_desc[:11].replace(b'\x00', b'').decode('latin1', errors='ignore').strip()
                ftype = chr(field_desc[11])
                flen = field_desc[16]
                fields.append((name, ftype, flen))
            
            f.seek(header_len)
            records = []
            for i in range(num_records):
                record_bytes = f.read(record_len)
                if not record_bytes or record_bytes[0] == 0x1A:
                    break
                if record_bytes[0] == 0x2A: # Eliminado
                    continue
                
                pos = 1
                row = {}
                for name, ftype, flen in fields:
                    raw_val = record_bytes[pos:pos+flen]
                    pos += flen
                    val_str = raw_val.decode('latin1', errors='ignore').strip()
                    row[name] = clean_mojibake(val_str)
                
                normalized = SigaParser._normalize_record(row, origen=origen)
                if normalized and normalized.get('dni'):
                    records.append(normalized)

            return records

    @staticmethod
    def _normalize_record(raw, origen=None):
        """
        Normaliza los nombres de campos del SIGA/Excel/CSV a un estándar unificado
        """
        if not raw or not isinstance(raw, dict):
            return None

        clean_raw = {}
        for k, v in raw.items():
            if k is not None:
                clean_k = str(k).replace('\ufeff', '').strip().upper()
                clean_v = clean_mojibake(str(v).strip()) if v is not None else ''
                clean_raw[clean_k] = clean_v

        # 1. Extraer DNI
        dni = ''
        dni_candidates = [
            'DNI', 'NUM_DOC', 'NUMERO_DOCUMENTO', 'NRO_DOC', 'NRO_DOCUMENTO',
            'NUM_DOCUMENTO', 'DOCUMENTO', 'DOC', 'COD_EMP', 'IDENTIFICACION', 'CEDULA',
            'COL_B', 'COL_1'
        ]
        for c in dni_candidates:
            if c in clean_raw and clean_raw[c]:
                val = re.sub(r'\D', '', clean_raw[c])
                if 6 <= len(val) <= 9:
                    dni = val.zfill(8) if len(val) < 8 else val
                    break

        if not dni:
            for val in clean_raw.values():
                digits = re.sub(r'\D', '', val)
                if len(digits) == 8:
                    dni = digits
                    break

        # Si no se pudo hallar un número de documento válido, descartar fila
        if not dni:
            return None

        # Esquema "Planilla PEA" (Pensionistas/Nombrados/CAS/Contratados): trae REGI_PENS_/CODI_AFPS_
        # con códigos en vez de texto libre, y el esquema de Altas nunca tiene estas columnas.
        is_pea_schema = 'CODI_AFPS_' in clean_raw or 'REGI_PENS_' in clean_raw

        # 2. Extraer Nombres y Apellidos
        ape_pat = clean_raw.get('APE_PAT') or clean_raw.get('APELLIDO_PATERNO') or clean_raw.get('PATERNO') or clean_raw.get('APELLIDO_PAT') or ''
        ape_mat = clean_raw.get('APE_MAT') or clean_raw.get('APELLIDO_MATERNO') or clean_raw.get('MATERNO') or clean_raw.get('APELLIDO_MAT') or ''
        nom_emp = clean_raw.get('NOM_EMP') or clean_raw.get('NOMBRES') or clean_raw.get('NOMBRE_TRAB') or clean_raw.get('NOMBRE') or ''
        nombre_completo = clean_raw.get('NOMBRE_COMPLETO') or clean_raw.get('APELLIDOS_NOMBRES') or clean_raw.get('APELLIDOS_Y_NOMBRES') or clean_raw.get('TRABAJADOR') or clean_raw.get('NOMB_CORT_') or ''

        # Manejar formato AFPNET positional (COL_2=Paterno, COL_3=Materno, COL_4=Nombres)
        if not ape_pat and not ape_mat and not nom_emp:
            if clean_raw.get('COL_2') and clean_raw.get('COL_4'):
                ape_pat = clean_raw.get('COL_2', '')
                ape_mat = clean_raw.get('COL_3', '')
                nom_emp = clean_raw.get('COL_4', '')

        # Si vino en campo 'NOMBRE' único (ej: "ABREGU HUAMAN, JOSE RENAN" o "RAMOS LUPU LUIS ALBERTO")
        if not ape_pat and (nombre_completo or nom_emp):
            target_name = nombre_completo if nombre_completo else nom_emp
            if ',' in target_name:
                parts = target_name.split(',', 1)
                apellidos = parts[0].strip().split()
                ape_pat = apellidos[0] if len(apellidos) > 0 else ''
                ape_mat = " ".join(apellidos[1:]) if len(apellidos) > 1 else ''
                nom_emp = parts[1].strip()
            else:
                words = target_name.strip().split()
                if len(words) == 2:
                    ape_pat, nom_emp = words[0], words[1]
                elif len(words) == 3:
                    ape_pat, ape_mat, nom_emp = words[0], words[1], words[2]
                elif len(words) >= 4:
                    ape_pat, ape_mat, nom_emp = words[0], words[1], " ".join(words[2:])

        ape_pat = clean_mojibake(ape_pat)
        ape_mat = clean_mojibake(ape_mat)
        nom_emp = clean_mojibake(nom_emp)
        nom_parts = nom_emp.strip().split()
        primer_nombre = nom_parts[0] if len(nom_parts) > 0 else ''
        segundo_nombre = " ".join(nom_parts[1:]) if len(nom_parts) > 1 else ''

        if not nombre_completo:
            apellidos = f"{ape_pat} {ape_mat}".strip()
            nombre_completo = f"{apellidos}, {nom_emp}".strip(", ") if apellidos and nom_emp else (apellidos or nom_emp)
        else:
            nombre_completo = clean_mojibake(nombre_completo)

        # 3. Extraer Fecha de Nacimiento (con soporte para números de fecha Excel)
        nacim_raw = (
            clean_raw.get('NACIM') or 
            clean_raw.get('FECHA_NACIMIENTO') or 
            clean_raw.get('FECHA_DE_NACIMIENTO') or 
            clean_raw.get('FECHA_NAC') or 
            clean_raw.get('FEC_NAC') or 
            clean_raw.get('FEC_NACIM') or 
            clean_raw.get('FECNAC') or 
            clean_raw.get('NACIMIENTO') or 
            clean_raw.get('CUMPLEANOS') or 
            clean_raw.get('CUMPLEAÑOS') or 
            clean_raw.get('CUMPLE') or
            clean_raw.get('F_NAC') or 
            clean_raw.get('FNAC') or 
            clean_raw.get('FECHANAC') or ''
        )
        if not nacim_raw:
            for k, v in clean_raw.items():
                if k.startswith('COL_'): continue
                k_clean = k.replace('_', ' ').replace('.', '').strip()
                if any(phrase in k_clean for phrase in ['NACIMIENTO', 'NACIM', 'CUMPLEA', 'FEC NAC', 'BIRTH']):
                    nacim_raw = str(v).strip()
                    if nacim_raw:
                        break

        fecha_nac = parse_date_to_dmy(nacim_raw)

        # 4. Régimen previsional y Previsiona en SIGA
        # a) Régimen previsional tal cual en el archivo del usuario (para PEA es exactamente REGI_PENS_)
        if is_pea_schema:
            raw_regimen = clean_raw.get('REGI_PENS_') or clean_raw.get('REGI_PENS') or clean_raw.get('REGIPENS') or ''
        else:
            raw_regimen = (
                clean_raw.get('REGI_PENS_') or 
                clean_raw.get('REGI_PENS') or 
                clean_raw.get('REGIPENS') or 
                clean_raw.get('REGIMEN_PREVISIONAL') or 
                clean_raw.get('REGIMEN_PENS') or 
                clean_raw.get('REGIMEN_PENSIONARIO') or ''
            )
            if not raw_regimen and clean_raw.get('REGIMEN'):
                reg_candidate = clean_raw.get('REGIMEN', '').strip()
                if reg_candidate.upper() not in AFP_NAMES and reg_candidate.upper() not in ('02', '03', '05', '06', '2', '3', '5', '6'):
                    raw_regimen = reg_candidate

        regimen_siga = clean_mojibake(str(raw_regimen).strip()) if raw_regimen else ''
        if regimen_siga == '5188':
            regimen_siga = '05188'

        # b) Previsiona tal cual en el archivo, con excepción de los códigos numéricos de AFP
        codi_afp = clean_raw.get('CODI_AFPS_', '').strip()
        raw_prev = clean_raw.get('PREVISIONA') or clean_raw.get('AFP') or clean_raw.get('SISTEMA_PENSION') or ''
        target_prev = codi_afp if codi_afp else str(raw_prev).strip()
        target_prev_norm = target_prev.zfill(2) if target_prev.isdigit() and len(target_prev) <= 2 else target_prev

        if target_prev_norm in AFP_CODE_MAP:
            previsional_siga = AFP_CODE_MAP[target_prev_norm]
        elif target_prev in AFP_CODE_MAP:
            previsional_siga = AFP_CODE_MAP[target_prev]
        else:
            previsional_siga = clean_mojibake(target_prev)

        # c) previsiona_siga unificado para compatibilidad con validación de semáforos
        if is_pea_schema:
            previsiona_siga = resolve_previsiona_pea(clean_raw.get('REGI_PENS_', ''), clean_raw.get('CODI_AFPS_', ''))
        else:
            previsiona_siga = previsional_siga or regimen_siga or clean_mojibake(str(raw_prev).strip())
        
        afiliacion_raw = (
            clean_raw.get('AFILIACION') or 
            clean_raw.get('FECHA_AFIL') or 
            clean_raw.get('FEC_AFIL') or 
            clean_raw.get('FECHA_AFILIACION') or 
            clean_raw.get('FEC_AFILIACION') or 
            clean_raw.get('FEC_AFILIAC') or 
            clean_raw.get('FECHA_DE_AFILIACION') or 
            clean_raw.get('F_AFIL') or 
            clean_raw.get('FAFIL') or 
            clean_raw.get('FECHAAFIL') or 
            clean_raw.get('FEC_ING') or 
            clean_raw.get('FECHA_INGRESO') or ''
        )
        if not afiliacion_raw:
            for k, v in clean_raw.items():
                if k.startswith('COL_'): continue
                k_clean = k.replace('_', ' ').replace('.', '').strip()
                if any(phrase in k_clean for phrase in ['AFILIACION', 'AFIL', 'FECHA AFIL', 'FEC AFIL']):
                    afiliacion_raw = str(v).strip()
                    if afiliacion_raw:
                        break

        afiliacion_siga = parse_date_to_dmy(afiliacion_raw)

        cuspp_siga = (
            clean_raw.get('CUSPP') or
            clean_raw.get('COD_CUSPP') or
            clean_raw.get('NUM_CUSPP') or
            clean_raw.get('CODIGO_CUSPP') or
            clean_raw.get('CODI_CUSP_') or ''
        )
        if not cuspp_siga:
            for k, v in clean_raw.items():
                if k.startswith('COL_'): continue
                k_clean = k.replace('_', ' ').replace('.', '').strip()
                if 'CUSPP' in k_clean:
                    cuspp_siga = str(v).strip()
                    if cuspp_siga:
                        break

        email = (
            clean_raw.get('DIRE_EMAI_') or
            clean_raw.get('DIRE_EMAI') or
            clean_raw.get('EMAIL_MPFN') or
            clean_raw.get('EMAIL') or
            clean_raw.get('CORREO') or
            clean_raw.get('CORREO_ELECTRONICO') or ''
        )
        if not email:
            for k, v in clean_raw.items():
                if k.startswith('COL_'): continue
                k_clean = k.replace('_', ' ').replace('.', '').strip()
                if any(phrase in k_clean for phrase in ['EMAI', 'CORREO', 'MAIL']):
                    email = str(v).strip()
                    if email:
                        break

        celular = (
            clean_raw.get('CELULAR') or
            clean_raw.get('NUM_CELULAR') or
            clean_raw.get('TELEFONO') or
            clean_raw.get('MOVIL') or
            clean_raw.get('TEL_MOVIL') or ''
        )
        if not celular:
            for k, v in clean_raw.items():
                if k.startswith('COL_'): continue
                k_clean = k.replace('_', ' ').replace('.', '').strip()
                if any(phrase in k_clean for phrase in ['CELULAR', 'TELEFONO', 'MOVIL', 'CEL']):
                    celular = str(v).strip()
                    if celular:
                        break

        return {
            'dni': dni,
            'nombre_completo': nombre_completo,
            'ape_paterno': ape_pat,
            'ape_materno': ape_mat,
            'nombres': nom_emp,
            'primer_nombre': primer_nombre,
            'segundo_nombre': segundo_nombre,
            'fecha_nacimiento': fecha_nac,
            'email': email.strip(),
            'celular': celular.strip(),
            'previsiona_siga': previsiona_siga,
            'regimen_siga': regimen_siga,
            'previsional_siga': previsional_siga,
            'afiliacion_siga': afiliacion_siga,
            'cuspp_siga': cuspp_siga,
            'regi_pens_codigo': ('05188' if (clean_raw.get('REGI_PENS_') or clean_raw.get('REGI_PENS') or '').strip().upper() == '5188' else (clean_raw.get('REGI_PENS_') or clean_raw.get('REGI_PENS') or '').strip().upper()) if is_pea_schema else '',
            'cargo': clean_raw.get('CARGO_DESC') or clean_raw.get('CARGO', ''),
            'monto_mensual': clean_raw.get('MONTO_MENS', ''),
            'regimen_laboral': clean_raw.get('DESC_REGL_', ''),
            'origen_planilla': origen,
            'raw_data': raw
        }

    @staticmethod
    def _read_csv(filepath, origen=None):
        records = []
        for enc in ['utf-8-sig', 'utf-8', 'latin1', 'cp1252']:
            try:
                with open(filepath, 'r', encoding=enc) as f:
                    sample = f.read(8192)
                    if not sample: continue
                    f.seek(0)
                    first_line = sample.splitlines()[0] if sample.splitlines() else sample
                    delims = [';', ',', '\t', '|']
                    counts = {d: first_line.count(d) for d in delims}
                    delim = max(counts, key=counts.get) if max(counts.values()) > 0 else ','
                    reader = csv.DictReader(f, delimiter=delim)
                    if reader.fieldnames:
                        reader.fieldnames = [str(fn).replace('\ufeff', '').strip().strip('"').strip("'") for fn in reader.fieldnames if fn]
                    for row in reader:
                        norm = SigaParser._normalize_record(row, origen=origen)
                        if norm and norm.get('dni'):
                            records.append(norm)
                    if records:
                        return records
            except Exception:
                continue
        return records

    @staticmethod
    def _read_xlsx(filepath, origen=None):
        records = []
        with zipfile.ZipFile(filepath, 'r') as z:
            shared_strings = []
            if 'xl/sharedStrings.xml' in z.namelist():
                tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
                for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                    t = si.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                    if t is not None and t.text:
                        shared_strings.append(clean_mojibake(t.text))
                    else:
                        text = ''.join([elem.text for elem in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t') if elem.text])
                        shared_strings.append(clean_mojibake(text))

            sheet_name = 'xl/worksheets/sheet1.xml'
            if sheet_name not in z.namelist():
                for name in z.namelist():
                    if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
                        sheet_name = name
                        break

            sheet_data = z.read(sheet_name)
            tree = ET.fromstring(sheet_data)
            rows = tree.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')

            headers = {}
            for r in rows:
                row_dict = {}
                for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                    ref = c.get('r', '')
                    col = ''.join(filter(str.isalpha, ref)).upper()
                    t = c.get('t')
                    v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                    val = v.text if v is not None else ''
                    if t == 's' and val.isdigit() and int(val) < len(shared_strings):
                        val = shared_strings[int(val)]
                    elif t == 'inlineStr':
                        it = c.find('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                        if it is not None and it.text: val = it.text
                    row_dict[col] = clean_mojibake(val.strip())

                if not row_dict:
                    continue

                if not headers:
                    vals_upper = " ".join(row_dict.values()).upper()
                    if any(k in vals_upper for k in ['DNI', 'NOMBRE', 'DOCUMENTO', 'CARGO', 'PATERNO']):
                        headers = {col: str(val).strip().replace('\ufeff', '').upper() for col, val in row_dict.items()}
                        continue
                    else:
                        headers = {col: f"COL_{col}" for col in row_dict.keys()}

                named_row = {}
                for col, val in row_dict.items():
                    col_name = headers.get(col, f"COL_{col}")
                    named_row[col_name] = val
                    named_row[f"COL_{col}"] = val
                
                norm = SigaParser._normalize_record(named_row, origen=origen)
                if norm and norm.get('dni'):
                    records.append(norm)

        return records

    @staticmethod
    def _read_xml_xls(filepath, origen=None):
        records = []
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        tree = ET.fromstring(content)
        ns = {'ss': 'urn:schemas-microsoft-com:office:spreadsheet'}
        table = tree.find('.//ss:Table', ns)
        if table is None:
            table = tree.find('.//{urn:schemas-microsoft-com:office:spreadsheet}Table')
        
        rows = table.findall('ss:Row', ns) if table is not None else []
        headers = []
        for r in rows:
            cells = []
            for c in r.findall('ss:Cell', ns):
                d = c.find('ss:Data', ns)
                cells.append(clean_mojibake(d.text.strip()) if d is not None and d.text else '')
            if not cells or not any(cells):
                continue
            if not headers:
                joined = " ".join(cells).upper()
                if any(k in joined for k in ['DNI', 'NOMBRE', 'DOCUMENTO', 'PATERNO', 'CARGO']):
                    headers = [c.replace('\ufeff', '').strip().upper() for c in cells]
                    continue
                else:
                    headers = [f"COL_{i}" for i in range(len(cells))]
            
            row_dict = {}
            for i, val in enumerate(cells):
                key = headers[i] if i < len(headers) else f"COL_{i}"
                row_dict[key] = val
                row_dict[f"COL_{i}"] = val

            norm = SigaParser._normalize_record(row_dict, origen=origen)
            if norm and norm.get('dni'):
                records.append(norm)
        return records

    @staticmethod
    def _read_xls(filepath, origen=None):
        with open(filepath, 'rb') as f:
            header = f.read(50)

        if b'<?xml' in header or b'<Workbook' in header:
            return SigaParser._read_xml_xls(filepath, origen=origen)

        return SigaParser._read_biff_xls(filepath, origen=origen)

    @staticmethod
    def _read_biff_xls(filepath, origen=None):
        with open(filepath, 'rb') as f:
            data = f.read()

        sec_size = 1 << struct.unpack_from('<H', data, 30)[0]
        dir_start = struct.unpack_from('<I', data, 48)[0]
        fat = []
        difat = [struct.unpack_from('<I', data, 76 + i*4)[0] for i in range(109)]
        for sec in difat:
            if sec in (0xFFFFFFFE, 0xFFFFFFFF): break
            offset = (sec + 1) * sec_size
            fat.extend(struct.unpack_from(f'<{sec_size//4}I', data, offset))
        
        def get_chain(start):
            chain = []
            cur = start
            while cur not in (0xFFFFFFFE, 0xFFFFFFFF) and cur < len(fat):
                chain.append(cur)
                cur = fat[cur]
            return chain

        dir_chain = get_chain(dir_start)
        dir_data = b''.join(data[(s + 1) * sec_size : (s + 2) * sec_size] for s in dir_chain)
        stream = None
        for i in range(0, len(dir_data), 128):
            entry = dir_data[i:i+128]
            name_len = struct.unpack_from('<H', entry, 64)[0]
            if name_len < 2: continue
            name = entry[:name_len-2].decode('utf-16le', errors='ignore')
            if name.lower() in ('workbook', 'book'):
                start_sec = struct.unpack_from('<I', entry, 116)[0]
                size = struct.unpack_from('<I', entry, 120)[0]
                chain = get_chain(start_sec)
                stream = b''.join(data[(s + 1) * sec_size : (s + 2) * sec_size] for s in chain)[:size]
                break

        if not stream:
            return []

        pos = 0
        sst = []
        cells = {}
        while pos < len(stream) - 4:
            rec_type, rec_len = struct.unpack_from('<HH', stream, pos)
            pos += 4
            rec_data = stream[pos : pos + rec_len]
            pos += rec_len
            if rec_type == 0x00FC: # SST
                tot_str, num_str = struct.unpack_from('<II', rec_data, 0)
                spos = 8
                for _ in range(num_str):
                    if spos >= len(rec_data): break
                    cch = struct.unpack_from('<H', rec_data, spos)[0]
                    flags = rec_data[spos+2]
                    spos += 3
                    is_utf16 = bool(flags & 0x01)
                    rich = bool(flags & 0x08)
                    ext = bool(flags & 0x04)
                    rich_count = struct.unpack_from('<H', rec_data, spos)[0] if rich else 0
                    if rich: spos += 2
                    ext_len = struct.unpack_from('<I', rec_data, spos)[0] if ext else 0
                    if ext: spos += 4
                    byte_len = cch * 2 if is_utf16 else cch
                    s_bytes = rec_data[spos : spos + byte_len]
                    spos += byte_len
                    if rich_count: spos += rich_count * 4
                    if ext_len: spos += ext_len
                    text = s_bytes.decode('utf-16le' if is_utf16 else 'latin1', errors='ignore')
                    sst.append(clean_mojibake(text))
            elif rec_type == 0x00FD: # LABELSST
                row, col, xf, sst_idx = struct.unpack_from('<HHHI', rec_data, 0)
                if sst_idx < len(sst): cells[(row, col)] = sst[sst_idx]
            elif rec_type == 0x0204: # LABEL
                row, col, xf = struct.unpack_from('<HHH', rec_data, 0)
                cch = struct.unpack_from('<H', rec_data, 6)[0]
                flags = rec_data[8]
                text = rec_data[9 : 9 + (cch*2 if flags&1 else cch)].decode('utf-16le' if flags&1 else 'latin1', errors='ignore')
                cells[(row, col)] = clean_mojibake(text)
            elif rec_type == 0x0203: # NUMBER
                row, col, xf, num = struct.unpack_from('<HHHd', rec_data, 0)
                cells[(row, col)] = str(int(num) if num.is_integer() else num)

        max_r = max((r for r, c in cells.keys()), default=-1)
        records = []
        headers = []
        for r in range(max_r + 1):
            max_c = max((c for r2, c in cells.keys() if r2 == r), default=-1)
            row_vals = [cells.get((r, c), '').strip() for c in range(max_c + 1)]
            if not any(row_vals): continue
            joined = " ".join(row_vals).upper()
            if "CONSULTA MASIVA DE CUSPP" in joined or "ESTAS COLUMNAS" in joined: continue
            if any(k in joined for k in ['DNI', 'NUMERO DE DOCUMENTO', 'APELLIDO PATERNO', 'NOMBRE']):
                headers = [c.replace('\ufeff', '').strip().upper() for c in row_vals]
                continue
            if not headers:
                headers = [f"COL_{i}" for i in range(len(row_vals))]
            row_dict = {}
            for i, val in enumerate(row_vals):
                key = headers[i] if i < len(headers) else f"COL_{i}"
                row_dict[key] = val
                row_dict[f"COL_{i}"] = val
            norm = SigaParser._normalize_record(row_dict, origen=origen)
            if norm and norm.get('dni'):
                records.append(norm)
        return records

    @staticmethod
    def parse_file(filepath, origen=None):
        """
        Punto de entrada universal para procesar nóminas de trabajadores
        en formatos .DBF, .XLSX, .XLS, .CSV y .TXT

        `origen` (opcional) etiqueta cada registro con la planilla de origen
        (ej. 'PENSIONISTAS', 'NOMBRADOS', 'CAS', 'CONTRATADOS') cuando se
        combinan varios archivos en una sola verificación de la PEA.
        """
        ext = os.path.splitext(filepath)[1].lower()
        if ext == '.dbf':
            return SigaParser.read_dbf(filepath, origen=origen)
        elif ext == '.xlsx':
            return SigaParser._read_xlsx(filepath, origen=origen)
        elif ext == '.xls':
            return SigaParser._read_xls(filepath, origen=origen)
        elif ext in ['.csv', '.txt']:
            return SigaParser._read_csv(filepath, origen=origen)
        else:
            raise ValueError(f"Extensión de archivo no soportada actualmente: {ext}. Formatos permitidos: .DBF, .XLSX, .XLS, .CSV")
