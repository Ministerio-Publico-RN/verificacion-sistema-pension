# Directrices y Reglas del Proyecto (Antigravity IDE)

## Optimización Estricta de Consumo de Tokens

1. **Prohibido generar tests**:
   - No crear tests unitarios, de integración ni suites de prueba automatizadas (Playwright, Jest, Pytest, etc.) salvo que el usuario lo solicite de manera explícita y directa.

2. **Prohibido recorrer el DOM / Browser Subagents**:
   - No utilizar subagentes de navegador ni realizar recorridos pesados del DOM de páginas web para inspecciones superficiales o inferencias innecesarias.

3. **Modularización y Componentización Estricta (Anti-Monolitos)**:
   - Dividir y desacoplar en componentes modulares pequeños y cohesivos en lugar de mantener archivos monolíticos gigantes (+1000 líneas).
   - Trabajar con módulos focalizados (50 a 250 líneas) para que cada lectura y edición consuma la mínima cantidad de tokens de contexto.
   - Separar lógicas por dominio: gestión de estado, renderizado de tabla, control de scrapers/SSE, modales, métricas y estilos por componente.

4. **Edición Focalizada y Concisión**:
   - Modificar únicamente bloques de código puntuales (`replace_file_content`).
   - No reescribir archivos enteros ni volcar contenidos excesivos.
   - Entregar respuestas breves, claras y orientadas directamente a la solución.
