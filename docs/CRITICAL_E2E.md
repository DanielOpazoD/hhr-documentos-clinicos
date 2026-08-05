# Flujos críticos E2E y accesibilidad

Esta puerta comprueba en Chromium los recorridos con mayor coste clínico o operativo si
regresan. Complementa las pruebas existentes; no replica cada variante de API ni cada
detalle cosmético.

## Frontera de cobertura

Antes de añadir navegador se auditó la cobertura existente:

- los contratos puros ya validan bloqueos de impresión, destinos de navegación, política de
  versiones, restauración y clasificación de errores recuperables;
- la integración HTTP ya valida persistencia D1/R2, concurrencia, aislamiento por propietario
  y respuestas de las rutas;
- las pruebas de producto ya protegen estructura renderizada y atributos ARIA esenciales.

La brecha era el comportamiento compuesto en un DOM real: teclado, foco, diálogos, menús,
viewport móvil, procesamiento local de imágenes y la transición entre vistas. Playwright
cubre únicamente esa brecha.

## Recorridos

Los mismos ocho recorridos se ejecutan en 1440 × 900 y 390 × 844:

1. crear, editar, guardar y reabrir un documento manual;
2. bloquear impresión, navegar al campo incorrecto y devolver el foco al disparador;
3. restaurar una versión histórica y recuperar después la versión que estaba vigente;
4. generar y guardar un borrador de IA con proveedor y respuesta simulados;
5. importar una imagen, ajustar acabado/bordes y preparar un PDF descargable;
6. seleccionar y abrir un formulario institucional;
7. cargar, seleccionar, mover y renombrar firma y timbre mediante teclado;
8. mostrar un error temporal con código de soporte y completar su reintento.

Cada superficie significativa ejecuta axe con WCAG 2 A/AA y 2.1 A/AA. Una infracción de
impacto `critical` o `serious` falla la puerta. No se deshabilita la regla de contraste.

## Datos y determinismo

- La aplicación se inicia con `tests/integration/local-app.mjs` sobre estado temporal de
  Wrangler, D1 y R2; el cierre elimina todo el directorio efímero.
- La identidad local es `preview@hhr.local` y todo nombre, RUT, documento, versión e imagen
  del escenario es sintético.
- La imagen de prueba se genera en memoria; no existe una ficha clínica en fixtures.
- La IA no contacta a proveedores: Playwright intercepta catálogo y stream NDJSON con una
  respuesta determinista. El guardado posterior usa la API real local.
- Un solo worker evita colisiones de estado. Los dos viewports tienen documentos de historial
  independientes.
- Capturas y trazas de fallos se escriben en el directorio temporal del sistema, nunca en el
  repositorio.

## Ejecución

Primera vez:

```bash
npm ci
npx playwright install chromium
```

Con un `dist` vigente:

```bash
npm run test:e2e
```

Desde una copia limpia, incluyendo build:

```bash
npm run test:e2e:full
```

`npm run verify` ejecuta esta puerta después de construir y completar contratos e integración.
CI instala exclusivamente Chromium y conserva un solo worker.

## Validación manual de cierre

Antes de publicar un cambio que afecte estos flujos:

- recorrer Documentos, IA, Escáner y Formularios con 1440 px y 390 px;
- confirmar que ningún control importante queda fuera del viewport móvil;
- abrir y cerrar historial, preflight, firma/timbre y editor del escáner;
- comprobar que el foco inicial es visible, no escapa de diálogos modales y vuelve al control
  que abrió la superficie;
- confirmar que la interacción crítica funciona sin ratón, salvo la selección nativa del
  archivo desde el sistema operativo.

## Exclusiones deliberadas

No hay snapshots visuales, Page Objects, datos reales, llamadas remotas de IA, pruebas de cada
variante de color ni una interfaz administrativa. `@playwright/test` y `axe-core` son
dependencias de desarrollo y no entran al bundle del producto.
