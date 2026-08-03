# Lenguaje visual de HHR Documentos

Este documento fija la gramática mínima compartida por las superficies del producto. Su propósito no es convertir la interfaz en un sistema de diseño independiente, sino evitar que cada módulo invente su propia jerarquía, densidad o estado visual.

## Principios

1. **Calma clínica.** El contenido y la tarea dominan; el color solo comunica jerarquía o estado.
2. **Una acción principal por contexto.** Las acciones secundarias acompañan, no compiten.
3. **Compacto sin ser estrecho.** Los controles son bajos y consistentes, mientras el documento y los formularios conservan espacio de trabajo.
4. **La misma arquitectura en cualquier tamaño.** Móvil reorganiza y envuelve; no crea otro producto.
5. **Estados honestos.** Carga, vacío, error y éxito describen el estado real y ofrecen una salida cuando corresponde.

## Tokens esenciales

Los tokens viven en `app/globals.css` y cubren solo decisiones repetidas:

- radios compactos, de control y de superficie: `--r-compact`, `--r-control`, `--r-surface`;
- escala tipográfica funcional: `--fs-caption`, `--fs-control`, `--fs-body`;
- colores semánticos existentes: tinta, cian funcional, verde, amarillo y peligro.

La densidad predeterminada usa controles de 40 px. Las barras o herramientas de alta frecuencia pueden bajar a 36 px mediante su selector contextual; no se agregan densidades intermedias.

## Primitivas compartidas

`app/components/VisualPrimitives.tsx` expone tres piezas deliberadamente pequeñas:

- `PageHeader`: título de página, explicación breve, contexto y acciones;
- `SectionHeader`: jerarquía interna y acción contextual;
- `EmptyState`: carga o ausencia de contenido, con descripción y salida opcionales.

Estas primitivas no contienen lógica de dominio ni deciden qué acción es primaria. Los componentes de cada módulo conservan esa responsabilidad.

## Jerarquía y acciones

- Los títulos de página usan un único `h1`; las secciones principales usan `h2`.
- La acción primaria utiliza `button primary`; acciones reversibles o de apoyo usan `button secondary` o `text-button`.
- Los botones de icono deben tener nombre accesible y no sustituyen una etiqueta cuando la acción no es obvia.
- Los grupos de selección exponen su relación mediante `role="group"`, `aria-label` y `aria-pressed` cuando corresponde.

## Superficies y estados

- Paneles, tarjetas, modales y herramientas comparten radios sobrios y bordes neutros.
- Los estados vacíos se presentan con `EmptyState`; no se reemplazan con datos de demostración.
- Un error operativo se muestra cerca de su tarea. No se usa rojo para orientación normal.
- El foco visible, el movimiento reducido y objetivos táctiles suficientes son parte de la gramática, no adornos opcionales.

## Comportamiento responsive

- A 820 px la navegación lateral se transforma en navegación móvil y las cabeceras envuelven su contexto y acciones.
- Las grillas se reducen antes de forzar scroll horizontal; las tablas que requieren comparación conservan su ancho y permiten desplazamiento.
- A 520 px las acciones generales ocupan el ancho disponible. El editor de documentos conserva excepciones compactas para no desplazar el papel.
- Las mismas prioridades y nombres se mantienen en escritorio y móvil.

## Superficies protegidas

La gramática no altera:

- la composición ni las reglas de impresión del papel clínico;
- los PDF y formularios institucionales oficiales;
- contratos de API, persistencia, migraciones o reglas clínicas;
- límites de bundle y carga diferida.

Una mejora visual que requiera cambiar alguno de esos contratos debe tratarse como un PR de dominio separado, con sus propias pruebas y revisión.

## Criterio de aceptación visual

Cada cambio transversal se revisa al menos en Inicio, Formularios, Documentos, Archivos, Escáner y Configuración, comparando escritorio y móvil cuando cambia la composición. La validación final registra capturas, diferencias observadas, correcciones y resultado en `design-qa.md`.
