# PR25 Design QA

## Método

- Referencia de escritorio: versión privada publicada después del PR24.
- Implementación: rama local `agent/pr25-unified-visual-grammar`.
- Navegador: navegador integrado de Codex.
- Escritorio: referencia e implementación capturadas a 1280 × 720, en el mismo punto superior de cada ruta.
- Móvil: Formularios comparado a 654 × 720 contra la captura de referencia previa. La implementación se renderizó temporalmente con el breakpoint real de 820 px y el ajuste de QA fue retirado antes de validar el código.
- Los datos de ambas instalaciones no son idénticos; la revisión compara jerarquía, proporción, densidad, bordes, controles, estados y desbordes, no el contenido clínico.

La evidencia reproducible está versionada en [`docs/assets/pr25-visual-qa.webp`](docs/assets/pr25-visual-qa.webp). Cada fila muestra la referencia a la izquierda y la implementación a la derecha, en el mismo orden de la tabla siguiente.

## Comparación por superficie

| Superficie | Archivo | Resultado | Observación |
| --- | --- | --- | --- |
| Inicio | Fila 1 | Aprobado | La jerarquía principal se conserva; los estados reales ahora usan la misma composición y no introducen tarjetas nuevas. |
| Formularios | Fila 2 | Aprobado | Título, descripción y acciones comparten la cabecera del producto; navegación y PDF mantienen prioridad y proporción. |
| Documentos | Fila 3 | Aprobado | Las herramientas permanecen compactas y el papel clínico conserva su composición. La diferencia de datos no altera la comparación visual. |
| Archivos | Fila 4 | Aprobado | Cabecera, toolbar, tarjetas y estado vacío siguen una densidad consistente sin desborde horizontal. |
| Escáner | Fila 5 | Aprobado | La selección de origen y el área de importación presentan una única tarea visible, con menor carga visual. |
| Configuración | Fila 6 | Aprobado | La explicación de página y las acciones se alinean con el resto del producto; pestañas y editor mantienen su jerarquía. |
| Formularios móvil | Fila 7 | Aprobado | Cabecera, acciones y selector horizontal permanecen accesibles; el PDF no se recorta lateralmente y la navegación móvil conserva objetivos táctiles. |

## Comprobaciones

- Ninguna ruta de escritorio presentó `scrollWidth` mayor que 1280 px.
- Los controles táctiles principales mantienen al menos 40 px y la navegación inferior 44 px.
- El foco visible y la preferencia de movimiento reducido siguen activos.
- No se modificaron el PDF institucional, la composición del papel clínico ni las reglas de impresión.
- El ajuste temporal usado para la captura móvil no aparece en el diff final.

## Resultado

Final result: passed
