# HHR Documentos Clínicos

Espacio web privado para crear, revisar, imprimir, escanear y respaldar documentación clínica del Hospital Hanga Roa.

## Capacidades

- Formularios institucionales originales para exámenes, imágenes y consentimientos.
- Certificados, informes y recetas externas editables.
- Perfiles profesionales con firma reutilizable y predeterminada.
- Importación de múltiples PDF e imágenes mediante OpenAI o un modelo local compatible.
- Catálogo versionado de prompts por tipo de documento.
- Escáner móvil multipágina con detección y edición de bordes, corrección de perspectiva y acabados en color, grises o blanco y negro.
- Un único QR móvil activo por usuario, con capacidad fuera de la ruta HTTP, archivos atribuidos a su sesión exacta y recuperación de cargas interrumpidas.
- Biblioteca privada de documentos y archivos con almacenamiento D1/R2 en Sites.
- Historial clínico restaurable y protección contra sobrescrituras accidentales entre pestañas.

La IA genera borradores editables. La revisión y firma final permanecen bajo control del profesional.

## Desarrollo local

Requiere Node.js 22.13 o superior.

```bash
cp .env.example .env.local
npm install
npm run dev
```

La terminal mostrará la dirección local cuando termine de iniciar.

## Inteligencia artificial

Para OpenAI, configure la clave solo en el servidor:

Defina `OPENAI_API_KEY` únicamente en el entorno del servidor. Puede seleccionar el modelo mediante `OPENAI_MODEL`; la plantilla incluida utiliza `gpt-5-mini`.

También puede conectarse a un servidor local compatible con la API de OpenAI mediante `LOCAL_AI_BASE_URL` y `LOCAL_AI_MODEL`. Las claves reales nunca deben guardarse en el repositorio ni enviarse al navegador.

Las operaciones costosas se reservan en D1 antes de contactar al modelo. Por defecto, cada usuario dispone de 40 intentos de OpenAI en una ventana móvil de 24 horas, con hasta 2 ejecuciones cloud simultáneas; el proveedor local tiene una ejecución simultánea independiente. Puede ajustar límites acotados mediante `AI_DAILY_CLOUD_LIMIT`, `AI_MAX_CONCURRENT_CLOUD` y `AI_MAX_CONCURRENT_LOCAL`. Los intentos cloud fallidos también consumen la ventana para impedir reintentos abusivos. Los borradores tienen 180 segundos y las operaciones de prompts 90 segundos antes de cancelarse de forma segura.

La [generación clínica](./docs/AI_CLINICAL_DRAFT_WORKFLOW.md) se organiza como un grafo pequeño y versionado: resuelve prompt y fuentes en paralelo, reserva capacidad, realiza una sola llamada al modelo y aplica un verificador determinista antes de entregar el borrador.

## Verificación

```bash
npm run lint
npm run typecheck
npm test
npm run check:bundle
```

El presupuesto de cliente mantiene el límite total de JS/CSS, controla el artefacto más grande y comprueba el peso efectivo de las rutas principales incluyendo los estilos globales. También vigila por separado `jsPDF` y el asistente: el primero se carga sólo al crear un PDF del escáner y la IA sólo al abrirla desde Documentos. La representación QR se genera en el servidor, por lo que el codificador vendorizado tampoco forma parte del cliente. El manifiesto y los límites por ruta deben conservar esas fronteras.

`npm test` construye el mismo Worker que se despliega y ejecuta pruebas de producto, contratos puros e integración HTTP sobre D1 y R2 locales desechables. Para ejecutar solo la integración desde un checkout sin build previo, use `npm run test:integration:full`.

`npm run verify` ejecuta el gate completo usado por integración continua, incluida la comprobación de migraciones generadas y los recorridos privados de documentos, archivos, firmas, captura móvil y presupuesto de IA por propietario. En el flujo móvil comprueba el contrato de enlace/QR, reemplazo concurrente, revocación, aislamiento por propietario y atribución exacta de archivos. Las pruebas utilizan identidades y contenido sintéticos; nunca llaman a proveedores de IA externos.

El esquema D1 se administra mediante migraciones versionadas. Para instalaciones históricas, el único puente excepcional es `npm run db:prepare` antes de `0005_schema_authority.sql`: puede añadir la columna y el índice de compatibilidad fuera del camino HTTP. Después de ese puente, todo cambio de esquema debe realizarse mediante una migración versionada. La guía de [despliegue, verificación y recuperación](./docs/DATABASE_MIGRATIONS.md) describe el respaldo previo, el control privado de integridad y el rollback ensayado en una base desechable.

## Arquitectura

- Next.js/React sobre Vinext y Cloudflare Workers.
- Drizzle ORM y D1 para datos estructurados.
- R2 para archivos privados.
- Rutas de servidor separadas para documentos, firmas, sesiones móviles e IA.

![Blueprint del sistema HHR-documentos](./docs/assets/hhr-system-blueprint.png)

El [blueprint de arquitectura](./docs/ARCHITECTURE_BLUEPRINT.md) reúne las fronteras,
dependencias y flujos críticos que deben mantenerse al diseñar cambios. Complementa la
[constitución del producto](./docs/PRODUCT_CONSTITUTION.md): la constitución define los
principios y el blueprint muestra dónde se aplican.

Este repositorio es público para permitir auditoría técnica y colaboración. No contiene datos clínicos, claves privadas ni archivos subidos por usuarios.
