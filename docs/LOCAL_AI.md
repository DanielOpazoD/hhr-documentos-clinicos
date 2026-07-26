# IA local

La aplicación admite dos proveedores intercambiables:

- **OpenAI:** procesa PDF, DOCX e imágenes mediante la API configurada.
- **Gemma local:** ejecuta `google/gemma-3-4b` cuantizado a 4 bits mediante LM Studio en el mismo Mac.

## Encender Gemma

Con LM Studio instalado y el modelo descargado:

```bash
npm run ai:local:start
```

El servidor se enlaza exclusivamente a `127.0.0.1:1234`; no se habilitan CORS ni acceso desde la red local. El estado puede comprobarse con:

```bash
npm run ai:local:status
```

## Formatos

- JPG y PNG se procesan directamente con la capacidad visual de Gemma.
- Los PDF digitales se convierten a texto localmente conservando marcadores de página.
- Los DOCX se extraen localmente antes de inferencia.
- Un PDF escaneado sin capa de texto debe convertirse a JPG o PNG, o procesarse con OpenAI.

## Publicación

Una aplicación publicada en Sites no puede acceder directamente al `localhost` del Mac. Para disponer de Gemma desde fuera del equipo se requiere un computador siempre encendido y un gateway HTTPS autenticado. La interfaz lo identifica de forma neutral como servidor externo; su privacidad y retención deben validarse antes de uso clínico. Nunca se debe publicar el puerto 1234 directamente en Internet.
