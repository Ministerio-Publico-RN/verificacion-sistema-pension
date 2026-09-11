# Sistema de Verificación Previsional | Ministerio Público - Fiscalía de la Nación

Aplicación institucional de alta precisión para la contrastación, acreditación y validación masiva del régimen previsional (SPP / SNP) de servidores públicos del Ministerio Público - Fiscalía de la Nación del Perú (MPFN).

---

## 🎯 Objetivos del Sistema

1. **Acreditación Automática:** Validar en tiempo real la situación previsional de los trabajadores ingresantes (CAS, 276, 728) contrastando los registros del SIGA con las fuentes oficiales.
2. **Cruce Inteligente Multifuente:**
   - **Superintendencia de Banca, Seguros y AFP (SBS):** Consulta individual automatizada y paralela mediante web scraping con Chromium Playwright.
   - **Portal Empleador AFPNET:** Gestión de archivos de intercambio masivo oficial (.xls / .xlsx) de aportes y comisiones.
3. **Detección de Discrepancias:** Identificación visual mediante semáforos de afiliados con datos contradictorios entre SIGA, SBS y AFPNET.

---

## 🏗️ Arquitectura y Tecnologías

- **Backend:** Python 3 (Threading HTTPServer nativo, cero dependencias pesadas para el core).
- **Automatización Web:** Playwright (Chromium) con BrowserContexts aislados y pool concurrente de trabajadores.
- **Frontend:** Vanilla HTML5 / CSS3 / JavaScript (Inter & Outfit fonts, componentes responsivos institucionales).
- **Mecanismos Anti-Bloqueo:** Limpieza inteligente de cookies de sesión Imperva WAF (`context.clear_cookies()`), sin penalización de 2 minutos.
- **Exportación Multiformato:** Reportes en Excel XML nativo (.xls), PDF institucional listo para impresión, y CSV plano (UTF-8 con BOM).

---

## 🚀 Puesta en Marcha

### Requisitos Previos
- Python 3.8 o superior instalado.
- Paquete Playwright (`pip install playwright` y `playwright install chromium`).

### Ejecución
Hacer doble clic en el acceso directo:
```cmd
iniciar_sistema.bat
```
El sistema iniciará automáticamente el servidor local en `http://localhost:8080` y abrirá la interfaz en el navegador predeterminado.

---

### Organización
Desarrollado para el **Ministerio Público - Fiscalía de la Nación (Perú)**.
