"""
Script de Investigación para Reducción de Automatización UI en la SBS
Objetivo: Determinar si el portal ASP.NET de la SBS puede consultarse directamente
mediante peticiones HTTP POST (milisegundos) sin necesidad de abrir navegadores.
URL: https://servicios.sbs.gob.pe/ReporteSituacionPrevisional/Afil_Consulta.aspx
"""
import requests
from bs4 import BeautifulSoup
import time
import urllib3

# Deshabilitar advertencias SSL en caso de certificados intermedios
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

SBS_URL = "https://servicios.sbs.gob.pe/ReporteSituacionPrevisional/Afil_Consulta.aspx"

def test_sbs_http(dni, ape_pat, ape_mat, primer_nom, segundo_nom=""):
    print(f"\n=======================================================")
    print(f"Probando consulta HTTP directa para:")
    print(f"DNI: {dni} | {ape_pat} {ape_mat}, {primer_nom} {segundo_nom}")
    print(f"=======================================================")

    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': SBS_URL
    })

    t0 = time.time()
    print("1. Enviando GET inicial para obtener __VIEWSTATE y tokens ASP.NET...")
    try:
        r_get = session.get(SBS_URL, timeout=15, verify=False)
        t_get = time.time() - t0
        print(f"   GET exitoso: Status {r_get.status_code} ({t_get:.2f}s)")
    except Exception as e:
        print(f"   ERROR en GET inicial: {e}")
        return None

    soup_get = BeautifulSoup(r_get.text, 'html.parser')
    
    # Extraer campos ocultos estándar de ASP.NET
    viewstate = soup_get.find('input', {'name': '__VIEWSTATE'})
    viewstate_val = viewstate['value'] if viewstate else ''
    
    viewstate_gen = soup_get.find('input', {'name': '__VIEWSTATEGENERATOR'})
    viewstate_gen_val = viewstate_gen['value'] if viewstate_gen else ''
    
    event_val = soup_get.find('input', {'name': '__EVENTVALIDATION'})
    event_val_val = event_val['value'] if event_val else ''

    # Listar todos los inputs de la página para identificar sus IDs exactos
    inputs = soup_get.find_all(['input', 'select', 'button'])
    input_names = [i.get('name') for i in inputs if i.get('name')]
    print(f"   Inputs detectados en el formulario ({len(input_names)}):")
    for name in input_names:
        print(f"     - {name}")

    # Identificar nombres de campos de búsqueda
    # Usualmente en WebForms tienen prefijos como ctl00$ContentPlaceHolder1$... o directos
    dni_field = next((n for n in input_names if 'txtNumeroDocumento' in n or 'Numero' in n or 'DNI' in n), None)
    tipo_doc_field = next((n for n in input_names if 'ddlTipoDocumento' in n or 'TipoDocumento' in n), None)
    pat_field = next((n for n in input_names if 'txtPaterno' in n or 'Paterno' in n), None)
    mat_field = next((n for n in input_names if 'txtMaterno' in n or 'Materno' in n), None)
    nom1_field = next((n for n in input_names if 'txtPrimerNombre' in n or 'PrimerNombre' in n), None)
    nom2_field = next((n for n in input_names if 'txtSegundoNombre' in n or 'SegundoNombre' in n), None)
    btn_field = next((n for n in input_names if 'btnBuscar' in n or 'Buscar' in n), None)

    print(f"\n   Mapeo de campos:")
    print(f"     Tipo Doc: {tipo_doc_field}")
    print(f"     Nro Doc : {dni_field}")
    print(f"     Paterno : {pat_field}")
    print(f"     Materno : {mat_field}")
    print(f"     Nom 1   : {nom1_field}")
    print(f"     Nom 2   : {nom2_field}")
    print(f"     Botón   : {btn_field}")

    # Preparar payload
    payload = {
        '__VIEWSTATE': viewstate_val,
        '__VIEWSTATEGENERATOR': viewstate_gen_val,
        '__EVENTVALIDATION': event_val_val,
    }

    if tipo_doc_field: payload[tipo_doc_field] = '0' # 0: DNI
    if dni_field: payload[dni_field] = dni
    if pat_field: payload[pat_field] = ape_pat
    if mat_field: payload[mat_field] = ape_mat
    if nom1_field: payload[nom1_field] = primer_nom
    if nom2_field: payload[nom2_field] = segundo_nom
    if btn_field: payload[btn_field] = 'Buscar'

    print("\n2. Enviando POST con los datos de consulta...")
    t1 = time.time()
    try:
        r_post = session.post(SBS_URL, data=payload, timeout=20, verify=False)
        t_post = time.time() - t1
        print(f"   POST exitoso: Status {r_post.status_code} ({t_post:.2f}s)")
    except Exception as e:
        print(f"   ERROR en POST: {e}")
        return None

    # Analizar respuesta
    soup_post = BeautifulSoup(r_post.text, 'html.parser')
    text_content = soup_post.get_text()

    if "No se encontraron resultados" in text_content:
        print(f"\n   RESULTADO SBS: 'No se encontraron resultados' (El trabajador NO está en SPP/AFP)")
        return {'status': 'NO_REGISTRADO', 'time': t_post}
    
    # Buscar tablas de resultados
    tables = soup_post.find_all('table')
    print(f"   Tablas encontradas en la respuesta: {len(tables)}")
    found_info = {}
    for idx, t in enumerate(tables):
        rows = t.find_all('tr')
        print(f"   --- Tabla #{idx+1} ({len(rows)} filas) ---")
        for r in rows:
            cols = [c.get_text(strip=True) for c in r.find_all(['td', 'th'])]
            if cols:
                print(f"       {' | '.join(cols)}")
                # Detectar AFP o CUSPP
                row_str = " ".join(cols).upper()
                for afp in ['PROFUTURO', 'INTEGRA', 'PRIMA', 'HABITAT']:
                    if afp in row_str:
                        found_info['afp'] = afp
                if 'CUSPP' in row_str:
                    found_info['cuspp_row'] = cols

    print(f"\n   TOTAL TIEMPO CONSUMIDO: {t_get + t_post:.2f} segundos")
    return {'status': 'ENCONTRADO', 'info': found_info, 'time': t_get + t_post}

if __name__ == '__main__':
    # Probamos con el primer trabajador del archivo DBF del SIGA:
    # ABREGU HUAMAN, JOSE RENAN | DNI 76534985 | PROFUTURO
    test_sbs_http('76534985', 'ABREGU', 'HUAMAN', 'JOSE', 'RENAN')
