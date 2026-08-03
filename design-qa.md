# PR25 Design QA

## Método

- Referencia de escritorio: versión privada publicada después del PR24.
- Implementación: rama local `agent/pr25-unified-visual-grammar`.
- Navegador: navegador integrado de Codex.
- Escritorio: referencia e implementación capturadas a 1280 × 720, en el mismo punto superior de cada ruta.
- Móvil: Formularios comparado a 654 × 720 contra la captura de referencia previa. La implementación se renderizó temporalmente con el breakpoint real de 820 px y el ajuste de QA fue retirado antes de validar el código.
- Los datos de ambas instalaciones no son idénticos; la revisión compara jerarquía, proporción, densidad, bordes, controles, estados y desbordes, no el contenido clínico.

La evidencia reproducible está versionada en [`docs/assets/pr25-visual-qa.webp`](docs/assets/pr25-visual-qa.webp). Cada fila muestra la referencia a la izquierda y la implementación a la derecha, en el mismo orden de la tabla siguiente.

La iteración solicitada sobre menús y plantillas IA se compara además en [`docs/assets/pr25-feedback-visual-qa.webp`](docs/assets/pr25-feedback-visual-qa.webp): referencia a la izquierda e implementación a la derecha.

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

## Iteración de feedback: menús y plantillas IA

- Fuentes visuales: `/var/folders/6c/jzmkty3d3zdc1p13lrvwgm7m0000gn/T/codex-clipboard-ad26f2e6-b4d8-4f63-84f6-a5b8d02bdb19.png` (1328 × 866 px) y `/var/folders/6c/jzmkty3d3zdc1p13lrvwgm7m0000gn/T/codex-clipboard-7782c385-1fe3-48a7-bbc0-26d618174b92.png` (2020 × 1000 px).
- Implementación: `pr25-new-document-menu-final.png` y `pr25-ai-templates-open.png`, capturadas desde `http://localhost:3030/documentos` a 1280 × 720 CSS px, `devicePixelRatio: 2`; la captura del navegador se normalizó a 1280 × 720 píxeles.
- Normalización: la referencia del menú se escaló y recortó al borde superior de 1280 × 720; la referencia IA se ajustó completa dentro de 1280 × 720. La comparación no atribuye diferencias producidas solo por ese cambio de densidad o encuadre.
- Estados: menú `Nuevo documento` abierto; asistente IA con `Configurar plantillas` abierto y `Certificado médico` seleccionado.
- Evidencia de vista completa y región enfocada: las dos filas del comparativo son suficientemente legibles para revisar menú, contexto IA y editor; no fue necesario un tercer recorte.

### Revisión sistemática

- Tipografía: las seis opciones del menú suben de 8 a 12 px y mantienen peso, truncado y jerarquía coherentes con los controles del producto.
- Ritmo y composición: `Nuevo documento` ya no duplica buscador ni recientes; la administración IA aparece en un único disclosure compacto y el editor completo solo ocupa espacio al abrirlo.
- Color y tokens: se reutilizan `--line`, `--cyan`, superficies y estados existentes; no se introduce una paleta paralela.
- Imágenes e iconos: permanecen el logo y la librería de iconos existentes, sin sustituciones rasterizadas ni recursos aproximados.
- Contenido: “plantillas” reemplaza el vocabulario interno “prompts” en la interfaz de administración, sin alterar las reglas clínicas almacenadas.

### Interacciones verificadas

1. Abrir `Nuevo documento`: solo aparecen las seis plantillas.
2. Pasar directamente a `Recientes`: se cierra el menú anterior y aparecen buscador y documentos guardados.
3. Abrir `Usar IA` y `Configurar plantillas`: se conserva el tipo seleccionado y aparecen crear, duplicar, mejorar con IA, predeterminar, editar y eliminar cuando corresponde.
4. El viewport de 1280 px mantiene `scrollWidth: 1280`; no hay desborde horizontal.

### Historial de comparación

- Hallazgo P2 inicial: el menú mezclaba creación con búsqueda y documentos recientes. Corrección: separación de estados y contenido; evidencia posterior: fila 1 del comparativo de feedback.
- Hallazgo P2 inicial: la configuración de plantillas obligaba a abandonar el asistente. Corrección: reutilización diferida del mismo `PromptManager` dentro de Documentos; evidencia posterior: fila 2 del comparativo de feedback.
- Revisión posterior: no quedan diferencias P0, P1 o P2 accionables. La adaptación móvil se conserva mediante el breakpoint existente de 820 px y sus contratos automatizados; no se añadió una segunda implementación del editor.

## Comprobaciones

- Ninguna ruta de escritorio presentó `scrollWidth` mayor que 1280 px.
- Los controles táctiles principales mantienen al menos 40 px y la navegación inferior 44 px.
- El foco visible y la preferencia de movimiento reducido siguen activos.
- No se modificaron el PDF institucional, la composición del papel clínico ni las reglas de impresión.
- El ajuste temporal usado para la captura móvil no aparece en el diff final.

## Resultado

Final result: passed
