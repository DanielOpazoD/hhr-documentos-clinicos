# Registro de QA visual

## PR40 · Jerarquía adaptativa del espacio clínico

Validado el 2 de septiembre de 2026 sobre datos locales sintéticos.

| Superficie | Escritorio | 390 px | Resultado |
| --- | --- | --- | --- |
| Documentos | Barra clínica compacta, una acción primaria y hoja adelantada | Sin desborde; contexto plegable y navegación inferior compacta | Conforme |
| Asistente IA | Prompt de 86 px inicial y bandeja única para arrastre, Adjuntar y Drive | Recorrido E2E completo solo con teclado | Conforme |
| Formularios | Acciones junto al visor activo y títulos largos legibles | Acciones apiladas, visor sin desborde horizontal de página | Conforme |
| Archivos | Abrir visible; mantenimiento agrupado en un menú | Tarjeta convertida en lista compacta | Conforme mediante E2E y contratos; biblioteca local vacía en inspección manual |

La inspección manual detectó que el CSS impedía ocultar los campos del paciente pese a que `aria-expanded` cambiaba. Se corrigió con una regla explícita para `[hidden]` y se añadió una regresión E2E en escritorio y móvil.

La suite crítica comprobó teclado, foco, impresión, escáner, formularios, firma/timbre, error recuperable y cero infracciones graves o críticas de axe en las superficies cubiertas. `npm run verify` quedó verde y el bundle permaneció bajo su presupuesto sin aumentarlo.

Las capturas de trabajo se mantienen fuera del artefacto de producción para no incrementar el paquete del sitio.
