from playwright.sync_api import sync_playwright
import re, time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('https://servicios.sbs.gob.pe/ReporteSituacionPrevisional/Afil_Consulta.aspx', wait_until='networkidle')
    
    workers = [
        ('76534985', 'ABREGU', 'HUAMAN', 'JOSE', 'RENAN'),
        ('10185554', 'AGUIRRE', 'VIRHUEZ', 'PILAR', 'JELENE')
    ]
    
    for dni, pat, mat, n1, n2 in workers:
        t0 = time.time()
        # Si esta visible el boton 'Consultar otro registro'
        btn_otro = page.query_selector("input[value*='otro registro'], #ctl00_ContentPlaceHolder1_btnOtro_Registro")
        if btn_otro and btn_otro.is_visible():
            btn_otro.click()
            page.wait_for_load_state('networkidle', timeout=10000)
            
        page.select_option('#ctl00_ContentPlaceHolder1_cboTipoDoc', '00')
        page.fill('#ctl00_ContentPlaceHolder1_txtNumeroDoc', dni)
        page.fill('#ctl00_ContentPlaceHolder1_txtAp_pat', pat)
        page.fill('#ctl00_ContentPlaceHolder1_txtAp_mat', mat)
        page.fill('#ctl00_ContentPlaceHolder1_txtPri_nom', n1)
        page.fill('#ctl00_ContentPlaceHolder1_txtSeg_nom', n2 or '')
        
        page.click('#ctl00_ContentPlaceHolder1_btnBuscar')
        page.wait_for_load_state('networkidle', timeout=15000)
        page.wait_for_timeout(300)
        
        body = page.inner_text('body')
        afp = 'NO REGISTRADO'
        for a in ['PROFUTURO', 'INTEGRA', 'PRIMA', 'HABITAT']:
            if a in body.upper():
                afp = a
                break
        m_c = re.search(r'[0-9]{6}[A-Z0-9]{6}', body)
        cuspp = m_c.group(0) if m_c else '-'
        print(f'{dni} ({pat}): {afp} | CUSPP: {cuspp} ({time.time()-t0:.2f}s)')
        
    browser.close()
