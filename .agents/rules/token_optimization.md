# Reglas de Optimización de Tokens de IA (Antigravity IDE)

Para minimizar el consumo de tokens y maximizar la precisión en el desarrollo:

## 1. Prohibición de Generación de Tests
- **NO generar tests unitarios, de integración ni suites automatizadas** (Playwright, Jest, Pytest, etc.) salvo solicitud expresa y literal del usuario.
- No generar scripts temporales de prueba no solicitados.

## 2. Prohibición de Recorridos del DOM y Browser Subagents
- **NO realizar recorridos pesados del DOM** ni usar subagentes de navegador para inferencias o tareas de inspección que puedan resolverse localmente.
- Evitar volcar estructuras HTML completas o logs masivos de DOM al contexto.

## 3. Modularización y Componentización Estricta (Anti-Monolitos)
- **Dividir y desacoplar en componentes modulares pequeños y cohesivos**: Evitar archivos monolíticos gigantes (+1000 líneas como `app.js`, `styles.css` o `index.html`).
- **Beneficio en tokens**: Al tener componentes modulares (ej. `modules/sbs.js`, `modules/table.js`, `modules/metrics.js`, componentes CSS temáticos, etc.), la IA solo necesita leer y modificar el archivo puntual de 50-200 líneas involucrado en la tarea, reduciendo drásticamente el consumo de tokens de contexto por cada tool call (`view_file`, `replace_file_content`).
- Mantener responsabilidades únicas: separar estado global, adaptadores de API/SSE, renderizado de tablas, modales y lógica de parsing.

## 4. Ediciones Quirúrgicas y Concisión
- Realizar modificaciones puntuales de bloques específicos evitando reescrituras de archivos enteros.
- Mantener respuestas breves, claras y centradas en la solución sin explicaciones redundantes.
