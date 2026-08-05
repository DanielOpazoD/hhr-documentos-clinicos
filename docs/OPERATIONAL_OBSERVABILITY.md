# Observabilidad operativa privada

## Alcance y estado

HHR-documentos emite un evento estructurado y acotado por cada solicitud API terminada. El
objetivo es correlacionar un código de soporte con una ruta lógica y una versión exacta, y
observar la salud básica del producto sin crear otra base de datos ni enviar información a un
proveedor nuevo.

Los umbrales de este documento son **objetivos iniciales en evaluación**, no SLO cumplidos ni
evidencia de aptitud clínica institucional. Deben recalibrarse con tráfico real suficiente y
con la aprobación del responsable operacional.

## Contrato `api_request` v1

Ejemplo sanitizado:

```json
{
  "operationalVersion": 1,
  "event": "api_request",
  "level": "warn",
  "outcome": "failure",
  "requestId": "123e4567-e89b-42d3-a456-426614174000",
  "route": "files.id.GET",
  "routeFamily": "files",
  "method": "GET",
  "status": 404,
  "code": "NOT_FOUND",
  "durationMs": 19,
  "releaseManifestVersion": 1,
  "releaseCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "releaseSchema": "0009_ai_trace_privacy"
}
```

El evento es una proyección por lista permitida, no un objeto de contexto extensible. Tiene un
límite de 768 caracteres ASCII y se escribe en los logs estructurados ya disponibles en el
runtime. Un fallo del logger se ignora y nunca cambia la respuesta al usuario.

La generación de IA por stream emite un único resultado terminal: `AI_GENERATION_SUCCEEDED`,
el código estable del fallo o `AI_EXECUTION_CANCELLED`. No se registra además un éxito al abrir
el stream.

### Información expresamente prohibida

- cuerpos o parámetros de URL;
- nombre, RUT, correo o cualquier identidad de paciente o propietario;
- texto clínico, evidencia, prompts o instrucciones libres;
- nombres, claves o contenido de archivos;
- tokens OAuth, cookies, credenciales, claves API o hashes derivados del usuario;
- mensajes de excepciones y respuestas de proveedores.

No se debe copiar el log completo a una ficha, documento clínico o ticket. Para soporte basta
el `requestId`, el momento aproximado y la acción que el usuario intentaba realizar.

## Indicadores básicos

Los indicadores se agrupan por `releaseCommit`, `releaseSchema`, `routeFamily`, `route`,
`method` y ventana temporal. Una publicación nueva no debe mezclarse con la anterior al
calcular una regresión.

| Indicador | Cálculo inicial | Lectura segura |
| --- | --- | --- |
| Disponibilidad técnica | solicitudes elegibles sin estado `5xx` / solicitudes elegibles | Excluir `401`, `403`, `404`, `409`, `413`, `429`, cancelaciones y el smoke sintético. Informar también volumen. |
| Latencia | p50 y p95 de `durationMs` | Separar por ruta y release; no mezclar IA con operaciones D1/R2. |
| Errores | conteo y porcentaje por `code` | El código estable sirve para tendencia; el `requestId`, para un caso individual. |
| Generación IA | `AI_GENERATION_SUCCEEDED` / ejecuciones terminales no canceladas | Informar `AI_PROVIDER_TIMEOUT` y otros fallos por separado. No inferir contenido ni tipo clínico. |
| Persistencia de archivos | éxitos de `files.POST` y `mobile-upload.POST` / intentos elegibles | Un `201` implica que el flujo de persistencia del endpoint terminó. La transformación del escáner ocurre en el cliente y no se telemetriza. |
| Procesamiento de fuentes | resultado terminal de `ai.import.POST` | No distingue si la fuente fue archivo o texto, para evitar añadir metadatos sensibles. |
| Release afectado | commit + esquema del evento | Resolver la huella exacta consultando el `release.json` de ese despliegue. |

Los percentiles con pocas muestras inducen a error. Para ventanas sin volumen suficiente se
publica `sin datos suficientes`, nunca `100 %` por ausencia de tráfico.

## Objetivos iniciales y alertas candidatas

Ventana de evaluación inicial: 28 días, revisada semanalmente.

| Superficie | Objetivo candidato | Muestra mínima para evaluarlo |
| --- | --- | --- |
| Rutas API no IA | disponibilidad técnica >= 99,5 % y p95 <= 1.500 ms | 1.000 solicitudes elegibles en 28 días |
| Generación clínica IA | éxito terminal >= 97 % y timeout < 2 % | 100 ejecuciones no canceladas en 28 días |
| Carga de archivos | éxito >= 99 % y p95 <= 5.000 ms | 200 cargas elegibles en 28 días |
| Smoke posterior a publicación | 100 % por cada release promovido | una ejecución inmediatamente después de promover |

Umbrales candidatos para revisión humana, con volumen mínimo para evitar ruido:

- una falla del smoke o una discordancia de release: revisar de inmediato y detener nuevas
  promociones;
- al menos cinco `5xx` en cinco minutos **y** más de 5 % de las solicitudes elegibles: incidente;
- al menos tres `AI_PROVIDER_TIMEOUT` en quince minutos **y** más de 10 % de las ejecuciones:
  revisar proveedor, cuota y red antes de reintentar;
- al menos tres fallos de carga en quince minutos **y** más de 5 % de las cargas: revisar D1,
  R2 y límites de payload.

No se automatiza una alerta remota en este PR. Los umbrales se aplican a los logs del runtime
existente hasta que la operación real justifique una integración institucional aprobada.

### Recalibración con evidencia

1. Reunir 28 días y las muestras mínimas sin cambiar el contrato durante la ventana.
2. Separar incidentes de plataforma, errores de aplicación y rechazos válidos del usuario.
3. Calcular p50, p95, tasa y volumen por release y ruta; conservar también días sin tráfico.
4. Comparar al menos dos releases estables y documentar estacionalidad o ventanas de baja
   conectividad.
5. Ajustar un objetivo solo con responsable, justificación y fecha. No elevarlo para ocultar
   una regresión ni reducirlo por una sola muestra atípica.
6. Declarar un SLO formal únicamente cuando existan medición sostenida, responsable, política
   de alertas y procedimiento institucional aprobados.

## Smoke posterior a publicación

El smoke hace dos solicitudes `GET`: lee `/release.json` y consulta un UUID aleatorio en
`/api/files/:id`. No envía cuerpo, no crea registros, no enumera archivos y acepta únicamente
el rechazo esperado `AUTH_REQUIRED` o `NOT_FOUND` con `requestId` correlacionado.

```bash
HHR_SMOKE_URL=http://127.0.0.1:8787 npm run smoke:operational
```

Para una publicación privada, `HHR_SMOKE_AUTHORIZATION` puede contener el encabezado
`Authorization` completo, inyectado desde un almacén protegido. No se pasa como argumento, no
se confirma en Git y el comando no lo imprime.

Una salida correcta contiene solo el código de soporte, ruta lógica, estado y la identidad
sanitizada del release. Después del smoke, buscar ese `requestId` en los logs y comprobar que
el evento posee el mismo commit y esquema.

## Diagnóstico por código de soporte

1. Pedir el `requestId` visible y el momento aproximado; nunca solicitar el documento o prompt.
2. Buscar coincidencia exacta de `requestId` en los logs del despliegue.
3. Confirmar `route`, `outcome`, `status`, `code`, `durationMs`, commit y esquema.
4. Leer `/release.json` del mismo despliegue y vincular commit/esquema con
   `artifact.fingerprint`. La huella no se incluye dentro del evento porque forma parte de un
   manifiesto calculado después del build; duplicarla allí produciría una identidad circular.
5. Comparar el código y la ruta con otros eventos del mismo release para distinguir un caso
   aislado de una regresión.
6. Reproducir únicamente con datos sintéticos y registrar la prueba que confirma la causa.

## Procedimiento de incidente

1. **Confirmar:** validar el código de soporte y preservar solo los campos permitidos.
2. **Acotar:** identificar ventana, ruta, código, volumen, release y primer/último evento.
3. **Clasificar:** diferenciar indisponibilidad, latencia, proveedor IA, D1/R2 o rechazo válido.
4. **Contener:** detener promociones y, si corresponde, promover la última versión privada sana
   ya verificada según [Integridad de publicación](./RELEASE_INTEGRITY.md).
5. **Proteger datos:** si el esquema cambió, seguir [Migraciones](./DATABASE_MIGRATIONS.md) y
   [Recuperación D1/R2](./DATA_RECOVERY.md); nunca improvisar una restauración remota.
6. **Verificar:** ejecutar el smoke, el flujo sintético afectado y la comprobación del release.
7. **Cerrar:** documentar causa, alcance, tiempos, decisión y prueba de recuperación sin PHI.

Si la emisión del evento falla, la operación del producto sigue su curso. Esa ausencia se trata
como degradación de observabilidad; no se intenta reconstruir el evento desde cuerpos, D1 o R2.

## Custodia

Los eventos permanecen en los logs privados del runtime existente. Su acceso y retención deben
ser mínimos y acordes a la política institucional y a la retención disponible en la plataforma.
No se exportan a hojas de cálculo, analítica de producto ni servicios personales. Al expirar la
retención, se conservan solo agregados operacionales aprobados que no permitan reidentificar a
una persona.
