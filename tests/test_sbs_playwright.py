"""
Prueba de consulta a la SBS con Playwright en modo Headless (Silencioso)
Evalúa la resolución del reCAPTCHA invisible y la extracción exacta de datos.
"""
from playwright.sync_api import sync_playwright
import time

SBS_URL = "https://servicios.sbs.gob.pe/ReporteSituacionPrevisional/Afil_Consulta.aspx"

def test_sbs_playwright(dni, ape_pat, ape_mat, primer_nom, segundo_nom=""):
    print(f"\n=======================================================")
    print(f"Probando consulta SBS con Playwright Headless:")
    print(f"DNI: {dni} | {ape_pat} {ape_mat}, {primer_nom} {segundo_nom}")
    print(f"=======================================================")

    t0 = time.time()
    with sync_playwright() as p:
        # Lanzamos Chromium en modo headless pero con User-Agent realista
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        page = context.new_page()

        print("1. Navegando al portal SBS...")
        page.goto(SBS_URL, wait_until="networkidle", timeout=30000)
        t_nav = time.time() - t0
        print(f"   Página cargada en {t_nav:.2f}s")

        print("2. Llenando campos del formulario...")
        # Seleccionar DNI (value 00)
        page.select_option("#ctl00_ContentPlaceHolder1_cboTipoDoc", "00")
        
        # Ingresar documento
        page.fill("#ctl00_ContentPlaceHolder1_txtNumeroDoc", dni)
        
        # Apellidos y nombres
        page.fill("#ctl00_ContentPlaceHolder1_txtAp_pat", ape_pat)
        page.fill("#ctl00_ContentPlaceHolder1_txtAp_mat", ape_mat)
        page.fill("#ctl00_ContentPlaceHolder1_txtPri_nom", primer_nom)
        if segundo_nom:
            page.fill("#ctl00_ContentPlaceHolder1_txtSeg_nom", segundo_nom)

        print("3. Haciendo clic en Buscar y esperando respuesta (grecaptcha invisible)...")
        t_click = time.time()
        
        # Hacemos click en el botón Buscar
        page.click("#ctl00_ContentPlaceHolder1_btnBuscar")

        # Esperamos a que aparezca la tabla de resultados o el mensaje de no resultados o error
        try:
            # Esperamos selector de resultados o mensaje
            page.wait_for_selector(
                "#ctl00_ContentPlaceHolder1_pnlResultados, #ctl00_ContentPlaceHolder1_lblMensaje, table",
                timeout=15000
            )
            # Pequeña pausa para asegurar renderizado completo
            page.wait_for_timeout(1000)
        except Exception as e:
            print("   Timeout esperando selector específico, extrayendo contenido actual...")

        t_resp = time.time() - t_click
        print(f"   Respuesta obtenida en {t_resp:.2f}s")

        # Inspeccionar el texto visible de la página
        body_text = page.inner_text("body")
        
        print("\n4. Analizando resultado obtenido:")
        if "No se encontraron resultados" in body_text:
            print("   >>> RESULTADO: 'No se encontraron resultados' (El trabajador NO está en AFP/SPP)")
            res = {'afiliado': False, 'estado': 'NO REGISTRADO EN SPP', 'raw': 'No se encontraron resultados'}
        elif "Error: La consulta es sospechosa" in body_text:
            print("   >>> ERROR: Incapsula/reCAPTCHA marcó consulta sospechosa")
            res = {'afiliado': None, 'estado': 'ERROR_CAPTCHA'}
        else:
            # Buscar datos de AFP y CUSPP en las tablas
            tables = page.query_selector_all("table")
            print(f"   Tablas en página: {len(tables)}")
            table_data = []
            for t_idx, tbl in enumerate(tables):
                t_text = tbl.inner_text()
                for afp in ['PROFUTURO', 'INTEGRA', 'PRIMA', 'HABITAT']:
                    if afp in t_text.upper():
                        print(f"   >>> ENCONTRADO EN TABLA #{t_idx+1}: AFP {afp}")
                table_data.append(t_text)
            
            # Extraer tabla de resultados principal si existe
            res = {
                'afiliado': True,
                'estado': 'AFILIADO SPP',
                'preview': body_text[:600]
            }

        # Guardar captura para verificación visual
        page.screenshot(path="docs/prueba_sbs_resultado.png")
        print("\n   Captura guardada en: docs/prueba_sbs_resultado.png")
        print(f"   TIEMPO TOTAL: {time.time() - t0:.2f} segundos")

        browser.close()
        return res

if __name__ == '__main__':
    # Probamos con el primer trabajador: ABREGU HUAMAN, JOSE RENAN | DNI 76534985 | PROFUTURO
    test_sbs_playwright('76534985', 'ABREGU', 'HUAMAN', 'JOSE', 'RENAN')
