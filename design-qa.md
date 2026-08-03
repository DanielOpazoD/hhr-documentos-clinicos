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

- Fuentes visuales reproducibles: [`docs/assets/pr25-source-new-document-menu.webp`](docs/assets/pr25-source-new-document-menu.webp) (1328 × 680 px, SHA-256 `72be3df7db1b6f0ffcdf6acf6683b15eb665a11eb74e6df4ac0c84e9605afb60`) y [`docs/assets/pr25-source-ai-template-workflow.webp`](docs/assets/pr25-source-ai-template-workflow.webp) (2210 × 1110 px, SHA-256 `b33f11e0c9d771125fa36d56d4836fdab0fabebfe142395666e355313a72b18e`). La primera conserva únicamente la superficie necesaria para comparar el menú y excluye los registros clínicos inferiores.
- Implementación: paneles derechos de [`docs/assets/pr25-feedback-visual-qa.webp`](docs/assets/pr25-feedback-visual-qa.webp) (SHA-256 `172dd68891a09a4e1ce4271eaeb1e2eca83f7acb50753f36aacdb2264796c065`), capturados desde `http://localhost:3030/documentos` a 1280 × 720 CSS px, `devicePixelRatio: 2`; la captura del navegador se normalizó a 1280 × 720 píxeles.
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

# PR27 · Workspace de Documentos artifact-first

## Contrato y evidencia

- Referencia: `main` posterior al PR26, antes de extraer la composición visual.
- Implementación: rama `agent/artifact-first-document-workspace`.
- Navegador: navegador integrado de Codex; 390 × 844 en móvil y 1440 × 900 en escritorio.
- Estados comparados: editor vacío, asistente IA y panel móvil de profesional, firma y timbre.
- El entorno local no dispone de los bindings remotos; los mensajes de carga visibles en ambas versiones son datos del entorno y no una regresión de composición.

| Estado | Antes | Después | Resultado |
| --- | --- | --- | --- |
| Editor móvil | [`pr27-before-mobile.webp`](docs/assets/pr27-before-mobile.webp) | [`pr27-after-mobile.webp`](docs/assets/pr27-after-mobile.webp) | Aprobado |
| Editor escritorio | [`pr27-before-desktop.webp`](docs/assets/pr27-before-desktop.webp) | [`pr27-after-desktop.webp`](docs/assets/pr27-after-desktop.webp) | Aprobado |
| Asistente IA escritorio | [`pr27-before-ai-desktop.webp`](docs/assets/pr27-before-ai-desktop.webp) | [`pr27-after-ai-desktop.webp`](docs/assets/pr27-after-ai-desktop.webp) | Aprobado |

## Hallazgos y correcciones

- En móvil, la suma de cabecera, paciente y formulario profesional empujaba la barra del papel hasta `y=753` y la hoja comenzaba en `y=820`. El profesional ahora se resume en 44 px y abre el panel existente; la barra queda en `y=485` y la hoja comienza en `y=525`, dentro del primer viewport.
- El paciente continúa siempre editable. No se agregó un asistente por pasos ni se ocultó información clínica esencial.
- Escritorio conserva una barra de paciente de 71 px, el profesional habitual en la navegación lateral y la hoja como superficie dominante.
- Editor e IA mantienen la misma cabecera, estado de documento y acción de retorno. El asistente conserva su selección al alternar porque ambas vistas viven dentro de un único `DocumentWorkspaceShell`.
- `Nuevo documento` y `Recientes` conservan estados mutuamente excluyentes, foco visible y menús sin desborde en 390 px.
- Los estilos de composición de Documentos tienen una sola autoridad en `app/features/documents/documents.css`; las hojas globales ya no duplican sus breakpoints.

## Interacciones verificadas

1. Abrir y cerrar `Nuevo documento` y `Recientes` con ratón y `Escape`.
2. Abrir el panel móvil desde `Editar profesional, firma y timbre`; los tres campos profesionales y ambos grupos de imágenes permanecen disponibles.
3. Cerrar el panel con `Escape`; el foco vuelve al botón que lo abrió.
4. Alternar entre editor e IA; la jerarquía principal no cambia y el asistente permanece montado.
5. Editar directamente título, identidad y secciones en la hoja; los selectores e identificadores usados por preflight no cambian.
6. Revisar los contratos de impresión: contexto clínico, cabecera y panel son `print-hide`; papel, títulos, cuerpos, firma y fecha conservan sus reglas específicas.

## Ratchet técnico

- Base: 643.807 bytes JS/CSS total y 474.987 bytes para la ruta Documentos.
- PR27: 643.780 bytes JS/CSS total y 474.960 bytes para la ruta Documentos.
- Resultado: el límite no aumenta; se recuperan 27 bytes sin modificar presupuestos, dependencias, APIs, datos ni migraciones.

Final result: passed
