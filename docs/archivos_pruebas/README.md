# Archivos y Datos de Prueba (Fixtures)

Este directorio contiene las muestras reales y archivos de prueba utilizados para validar el funcionamiento del **Sistema de Verificación Previsional**.

---

## 📋 Catálogo de Archivos de Prueba

### 1. `altas cas set 2026.DBF`
* **Tipo:** Archivo dBase III / Visual FoxPro (.DBF)
* **Origen:** Sistema Integrado de Gestión Administrativa (SIGA) - Ministerio Público.
* **Registros:** 133 trabajadores bajo régimen CAS.
* **Propósito:** Muestra principal para probar la carga y extracción de trabajadores (DNI, apellidos, nombres, cargo, fecha de ingreso).
* **Uso en el Sistema:**
  * Carga manual arrastrando el archivo en la pantalla principal.
  * Carga rápida automática con el botón *"⚡ Cargar Archivo de Prueba Oficial (altas cas set 2026.DBF)"*.

---

### 2. `Consulta_CUSPP_Masiva_Ejemplo.xls`
* **Tipo:** Libro de Microsoft Excel 97-2003 (.xls / BIFF8)
* **Origen:** Portal oficial de empleadores de AFPNET (`https://www.afpnet.com.pe/`).
* **Propósito:** Plantilla base original descargada de AFPNET que sirvió como ingeniería inversa para determinar la estructura de columnas exacta (`Tipo Doc = 0`, `N° Doc`, `Apellido Paterno`, `Apellido Materno`, `Nombres`) requerida por la plataforma de las AFP.

---

### 3. `prueba_1_Consulta_CUSPP_Masiva_Ejemplo.xls`
* **Tipo:** Libro de Microsoft Excel (.xls)
* **Origen:** Lote de consulta generado a partir de la nómina de trabajadores de prueba (26 registros).
* **Propósito:** Archivo con formato de carga masiva de AFPNET listo para ser subido al portal `ConsultaCusppMasiva` con el primer grupo de trabajadores.

---

### 4. `res_prueba_1_consultaCUSPPMasiva.xlsx`
* **Tipo:** Libro de Microsoft Excel OpenXML (.xlsx)
* **Origen:** Descarga oficial procesada y emitida por la plataforma AFPNET tras consultar el lote 1.
* **Registros:** 26 registros con información previsional completa.
* **Datos Clave Extraídos:**
  * `DNI` (Documento de Identidad)
  * `CUSPP` (Código Único del Sistema Privado de Pensiones)
  * `AFP` (PROFUTURO, PRIMA, HABITAT, INTEGRA)
  * `Tipo de Comisión` (MIXTA o FLUJO)
  * `Porcentaje de Comisión`
  * `Último Devengue / Devengue Máximo` (ej. 2026-09)
  * `Situación / Motivo de Salida` (ej. Continúa)
* **Uso en el Sistema:**
  * Se procesa de forma instantánea y nativa con `AfpnetParser` (sin librerías pesadas externas).
  * Puede cargarse directamente en la pestaña **AFPNET** mediante el botón *"⚡ Cargar Archivo de Prueba Oficial"*.
