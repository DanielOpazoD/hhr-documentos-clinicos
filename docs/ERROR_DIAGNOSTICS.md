# Diagnóstico seguro de errores

La aplicación asigna un `requestId` nuevo a cada solicitud API. Cuando una operación falla, el mismo identificador aparece en la respuesta, en el encabezado `x-request-id` y en una entrada estructurada del runtime.

## Datos registrados

Cada evento `api_request_failed` contiene exclusivamente:

- evento `api_request_failed`;
- `requestId`, ruta lógica y método HTTP;
- estado, código estable y duración;
- nivel `warn` para errores esperables y `error` para fallos del servidor.

No se registran cuerpos, parámetros de URL, correo, nombres, RUT, contenido clínico, prompts, nombres de archivos ni mensajes de excepciones. Los errores inesperados se muestran como un mensaje genérico.

## Procedimiento de diagnóstico

1. Solicitar al usuario el código de soporte visible, nunca el contenido clínico.
2. Buscar ese `requestId` en los logs del despliegue.
3. Identificar la ruta, el estado y el código sin reconstruir el cuerpo de la solicitud.
4. Reproducir el flujo con datos sintéticos en local.
5. Registrar la causa, la corrección y la validación utilizada.

Los errores que ocurren después de iniciar una generación con IA usan `AI_GENERATION_FAILED` y conservan el mismo identificador de la solicitud que abrió el stream.

## Límites actuales

Esta trazabilidad no reemplaza alertas externas, métricas agregadas ni un procedimiento institucional de incidentes. No requiere proveedor adicional, migración ni almacenamiento de información clínica.
