import requests
from bs4 import BeautifulSoup
import urllib3
urllib3.disable_warnings()

r = requests.get('https://servicios.sbs.gob.pe/ReporteSituacionPrevisional/Afil_Consulta.aspx', verify=False)
soup = BeautifulSoup(r.text, 'html.parser')

form = soup.find('form')
print('Form action:', form.get('action'), 'method:', form.get('method'), 'onsubmit:', form.get('onsubmit'))

for inp in form.find_all(['input', 'select']):
    name = inp.get('name')
    itype = inp.get('type', inp.name)
    val = inp.get('value', '')
    iid = inp.get('id', '')
    print(f"[{itype}] name='{name}' id='{iid}' val='{val[:30] if val else ''}'")
    if inp.name == 'select':
        for opt in inp.find_all('option'):
            print(f"   opt: value='{opt.get('value')}' text='{opt.get_text().strip()}'")

print('\n--- BUSCANDO SCRIPTS RELEVANTES ---')
for s in soup.find_all('script'):
    src = s.get('src')
    if src:
        print('Script src:', src)
    else:
        text = s.get_text()
        for kw in ['btnBuscar', 'sospechosa', 'cboTipoDoc', 'txtAp_pat', 'submit', 'token']:
            if kw in text:
                print(f"Match '{kw}':\n{text[:600]}\n---")
                break
