# Diagnóstico seguro de errores

La aplicación asigna un `requestId` nuevo a cada solicitud API. Cuando una operación falla, el mismo identificador aparece en la respuesta, en el encabezado `x-request-id` y en una entrada estructurada del runtime.

## Datos registrados

Cada evento versionado `api_request` contiene exclusivamente:

- resultado terminal `success`, `failure` o `cancelled`;
- `requestId`, ruta lógica y método HTTP;
- estado, código estable y duración;
- nivel `info` para éxitos, `warn` para errores esperables y `error` para fallos del servidor;
- versión de manifiesto, commit y esquema compilados en el artefacto.

No se registran cuerpos, parámetros de URL, correo, nombres, RUT, contenido clínico, prompts, nombres de archivos ni mensajes de excepciones. Los errores inesperados se muestran como un mensaje genérico.

## Procedimiento de diagnóstico

1. Solicitar al usuario el código de soporte visible, nunca el contenido clínico.
2. Buscar ese `requestId` en los logs del despliegue.
3. Identificar la ruta, el estado y el código sin reconstruir el cuerpo de la solicitud.
4. Reproducir el flujo con datos sintéticos en local.
5. Registrar la causa, la corrección y la validación utilizada.

Los errores que ocurren después de iniciar una generación con IA usan `AI_GENERATION_FAILED` y conservan el mismo identificador de la solicitud que abrió el stream. Un timeout usa `AI_PROVIDER_TIMEOUT`; los límites previos a la llamada usan `AI_DAILY_LIMIT_REACHED` o `AI_CONCURRENCY_LIMIT_REACHED` y entregan `Retry-After` sin revelar prompts ni datos de la fuente. Una cancelación solicitada por el usuario usa `AI_EXECUTION_CANCELLED`, termina la reserva como `cancelled` y emite un único resultado terminal. Un éxito usa `AI_GENERATION_SUCCEEDED`.

## Límites actuales

Esta trazabilidad no acredita por sí sola un SLO ni reemplaza la respuesta institucional a incidentes. No requiere proveedor adicional, migración ni almacenamiento de información clínica. El contrato, los indicadores provisionales, el smoke sintético y la recalibración se documentan en [Observabilidad operativa privada](./OPERATIONAL_OBSERVABILITY.md).
