# Suite de Pruebas y Herramientas de Investigación

Este directorio contiene las pruebas automatizadas de integración y herramientas de investigación/inspección técnica de los portales externos (SBS y AFPNET).

---

## 📁 Estructura

```text
tests/
├── README.md                 # Esta guía
├── test_networkidle.py       # Prueba de estabilidad de navegación secuencial en SBS
├── test_sbs_playwright.py    # Prueba end-to-end de consulta SBS con Playwright
└── research/                 # Scripts de análisis exploratorio e ingeniería inversa
    ├── inspect_sbs_form.py   # Extractor de campos, tokens y formularios de SBS
    └── research_sbs_http.py  # Análisis de peticiones HTTP, ViewState y cabeceras
```

---

## 🚀 Ejecución de Pruebas

### 1. Prueba de consulta SBS con Playwright
Ejecuta una consulta automatizada en modo Headless sobre el portal público de la SBS con extracción de datos:
```powershell
python tests/test_sbs_playwright.py
```

### 2. Prueba de estabilidad de red (NetworkIdle)
Valida la navegación y ciclo de espera entre consultas sucesivas en SBS:
```powershell
python tests/test_networkidle.py
```

### 3. Herramientas de Inspección (`research/`)
Permiten examinar la estructura HTML y respuestas de los portales:
```powershell
python tests/research/inspect_sbs_form.py
python tests/research/research_sbs_http.py
```
