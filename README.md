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

### Opción A: Ejecutable portable (recomendado para usuarios no técnicos)
1. Ir a la sección [Releases](../../releases) del repositorio.
2. Descargar `VerificacionPrevisional-MPFN.exe` de la versión más reciente.
3. Colocarlo en cualquier carpeta (de preferencia una carpeta propia, no una unidad de red compartida) y hacer doble clic.
4. En el primer arranque descargará Chromium automáticamente (requiere internet solo esa vez); luego funciona sin conexión. Se abrirá el navegador en `http://localhost:8080` automáticamente.

El `.exe` crea junto a sí mismo las carpetas `data/` (historial de ejecuciones), `browsers/` (Chromium) y `uploads/` — no requiere instalar Python ni nada adicional.

### Opción B: Desde el código fuente (para desarrollo)
Requisitos previos:
- Python 3.8 o superior instalado.
- Paquete Playwright (`pip install -r requirements.txt` y `playwright install chromium`).

Ejecución — doble clic en:
```cmd
iniciar_sistema.bat
```
El sistema iniciará automáticamente el servidor local en `http://localhost:8080` y abrirá la interfaz en el navegador predeterminado.

### Publicar una nueva versión del ejecutable
El workflow `.github/workflows/build-release.yml` compila el frontend, empaqueta el `.exe` con PyInstaller y lo publica en GitHub Releases automáticamente al crear un tag `vX.Y.Z`:
```cmd
git tag v1.0.0
git push origin v1.0.0
```
También puede lanzarse manualmente desde la pestaña "Actions" del repositorio (`workflow_dispatch`), sin crear un tag, para generar solo el artefacto de build. Para compilar el `.exe` localmente sin pasar por GitHub: `powershell -ExecutionPolicy Bypass -File scripts/build_exe.ps1`.

---

### Organización
Desarrollado para el **Ministerio Público - Fiscalía de la Nación (Perú)**.
