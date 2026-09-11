"""
Módulo de parseo e ingesta de archivos de trabajadores del SIGA (MPFN)
Soporta archivos .DBF (dBase III / Visual FoxPro del SIGA), .xlsx, .xls y .csv
"""
import os
import re
import csv
from datetime import datetime

class SigaParser:
    @staticmethod
    def read_dbf(filepath):
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
                # Si el primer byte es asterisco '*' el registro está marcado como borrado
                if record_bytes[0] == 0x2A:
                    continue
                
                pos = 1
                row = {}
                for name, ftype, flen in fields:
                    raw_val = record_bytes[pos:pos+flen]
                    pos += flen
                    val = raw_val.decode('latin1', errors='ignore').strip()
                    row[name] = val
                
                normalized = SigaParser._normalize_record(row)
                records.append(normalized)
            
            return records

    @staticmethod
    def _normalize_record(raw):
        """
        Normaliza los nombres de campos del SIGA a un estándar unificado
        """
        dni = raw.get('DNI') or raw.get('NUM_DOC') or raw.get('DOCUMENTO') or ''
        dni = re.sub(r'\D', '', dni)
        if len(dni) < 8 and len(dni) > 0:
            dni = dni.zfill(8)

        ape_pat = raw.get('APE_PAT') or raw.get('APELLIDO_PATERNO') or ''
        ape_mat = raw.get('APE_MAT') or raw.get('APELLIDO_MATERNO') or ''
        nom_emp = raw.get('NOM_EMP') or raw.get('NOMBRES') or ''
        nombre_completo = raw.get('NOMBRE') or raw.get('NOMBRE_COMPLETO') or ''

        if not ape_pat and ',' in nombre_completo:
            parts = nombre_completo.split(',', 1)
            apellidos = parts[0].strip().split()
            ape_pat = apellidos[0] if len(apellidos) > 0 else ''
            ape_mat = " ".join(apellidos[1:]) if len(apellidos) > 1 else ''
            nom_emp = parts[1].strip()

        nom_parts = nom_emp.strip().split()
        primer_nombre = nom_parts[0] if len(nom_parts) > 0 else ''
        segundo_nombre = " ".join(nom_parts[1:]) if len(nom_parts) > 1 else ''

        if not nombre_completo:
            nombre_completo = f"{ape_pat} {ape_mat}, {nom_emp}".strip(", ")

        nacim_raw = raw.get('NACIM') or raw.get('FECHA_NACIMIENTO') or ''
        fecha_nac = ''
        if len(nacim_raw) == 8 and nacim_raw.isdigit():
            try:
                dt = datetime.strptime(nacim_raw, "%Y%m%d")
                fecha_nac = dt.strftime("%d/%m/%Y")
            except Exception:
                fecha_nac = f"{nacim_raw[6:8]}/{nacim_raw[4:6]}/{nacim_raw[0:4]}"
        elif '-' in nacim_raw:
            parts = nacim_raw.split('-')
            if len(parts[0]) == 4:
                fecha_nac = f"{parts[2]}/{parts[1]}/{parts[0]}"
            else:
                fecha_nac = nacim_raw
        elif '/' in nacim_raw:
            fecha_nac = nacim_raw

        previsiona_siga = raw.get('PREVISIONA') or raw.get('REGIMEN') or raw.get('SISTEMA_PENSION') or ''
        afiliacion_siga = raw.get('AFILIACION') or ''
        if len(afiliacion_siga) == 8 and afiliacion_siga.isdigit():
            afiliacion_siga = f"{afiliacion_siga[6:8]}/{afiliacion_siga[4:6]}/{afiliacion_siga[0:4]}"
            
        cuspp_siga = raw.get('CUSPP') or ''

        return {
            'dni': dni,
            'nombre_completo': nombre_completo,
            'ape_paterno': ape_pat,
            'ape_materno': ape_mat,
            'nombres': nom_emp,
            'primer_nombre': primer_nombre,
            'segundo_nombre': segundo_nombre,
            'fecha_nacimiento': fecha_nac,
            'previsiona_siga': previsiona_siga,
            'afiliacion_siga': afiliacion_siga,
            'cuspp_siga': cuspp_siga,
            'cargo': raw.get('CARGO', ''),
            'monto_mensual': raw.get('MONTO_MENS', ''),
            'regimen_laboral': raw.get('DESC_REGL_', ''),
            'raw_data': raw
        }

    @staticmethod
    def parse_file(filepath):
        ext = os.path.splitext(filepath)[1].lower()
        if ext == '.dbf':
            return SigaParser.read_dbf(filepath)
        elif ext in ['.csv', '.txt']:
            return SigaParser._read_csv(filepath)
        else:
            raise ValueError(f"Extensión de archivo no soportada actualmente: {ext}. Utilice archivos .DBF o .CSV")

    @staticmethod
    def _read_csv(filepath):
        records = []
        with open(filepath, 'r', encoding='latin1') as f:
            reader = csv.DictReader(f)
            for row in reader:
                records.append(SigaParser._normalize_record(row))
        return records
