# HHR Documentos Clínicos

Espacio web privado para crear, revisar, imprimir, escanear y respaldar documentación clínica del Hospital Hanga Roa.

## Capacidades

- Formularios institucionales originales para exámenes, imágenes y consentimientos.
- Certificados, informes y recetas externas editables.
- Perfiles profesionales con firma reutilizable y predeterminada.
- Importación de múltiples PDF e imágenes mediante OpenAI o un modelo local compatible.
- Catálogo versionado de prompts por tipo de documento.
- Escáner móvil multipágina con detección y edición de bordes, corrección de perspectiva y acabados en color, grises o blanco y negro.
- Biblioteca privada de documentos y archivos con almacenamiento D1/R2 en Sites.

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

## Verificación

```bash
npm run lint
npm run build
node --test tests/rendered-html.test.mjs
```

## Arquitectura

- Next.js/React sobre Vinext y Cloudflare Workers.
- Drizzle ORM y D1 para datos estructurados.
- R2 para archivos privados.
- Rutas de servidor separadas para documentos, firmas, sesiones móviles e IA.

Este repositorio es público para permitir auditoría técnica y colaboración. No contiene datos clínicos, claves privadas ni archivos subidos por usuarios.
