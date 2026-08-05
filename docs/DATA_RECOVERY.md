# Recuperación verificable de D1 y R2

## Alcance

`npm run recovery:drill` demuestra el contrato de recuperación sobre un entorno local creado
por el propio comando. El ensayo contiene únicamente datos sintéticos, no recibe rutas por
argumento, no carga credenciales, no usa Wrangler y no puede contactar ni restaurar D1/R2
remotos.

No es un sistema general de disaster recovery ni reemplaza el respaldo institucional. Su
función es hacer verificables las invariantes que un procedimiento operativo real debe
conservar:

1. inventariar D1 y los objetos R2 referenciados;
2. bloquear el respaldo si existen huérfanos, duplicados o ownership incoherente;
3. crear un respaldo privado y un manifiesto sin payload clínico;
4. destruir solamente el directorio local marcado como desechable;
5. restaurar primero D1 y después los objetos R2;
6. comparar conteos, checksums, relaciones y ownership;
7. conservar el respaldo y una fase reanudable si la restauración se interrumpe.

## Ensayo local

```bash
npm run recovery:drill
```

La suite crea dos propietarios ficticios y cubre las 14 tablas de producto más
`d1_migrations`. Incluye documentos, dos versiones por documento, archivos de escritorio y
móviles, asociaciones documento–archivo, firmas, timbres, plantillas, configuración de
plantillas y prompts. Ocho blobs sintéticos representan el bucket R2.

El comando comprueba:

- restauración exacta de cada tabla mediante conteo y SHA-256 lógico de sus filas;
- checksum físico del respaldo SQLite y checksum del esquema;
- checksum, tamaño, tipo y propietario de cada objeto;
- correspondencia de propietario en versiones, archivos móviles, adjuntos y prompts de
  plantillas;
- ausencia de objetos R2 no referenciados y referencias sin blob;
- detección deliberada de un blob faltante, una clave duplicada, una relación huérfana y un
  adjunto asignado a otro propietario;
- rollback de una mutación local usando el mismo respaldo;
- fallo sintético después de restaurar D1, conservación intacta del respaldo y reanudación
  completa posterior.

El directorio temporal exige simultáneamente un prefijo reservado, ubicación directa bajo el
directorio temporal del sistema y un marcador interno. Toda eliminación valida esas tres
condiciones antes de ejecutarse. Al terminar las pruebas se elimina el entorno sintético.

## Manifiesto mínimo

El archivo `manifest.json` contiene solamente:

- versión del formato y fecha de creación;
- historial de migraciones, checksum del esquema y checksum del SQLite respaldado;
- nombre, conteo y checksum lógico de cada tabla;
- para cada objeto, hash de la clave, hash del contenido, tamaño, tipo MIME, clase de activo y
  un slot opaco de propietario;
- conteos por tabla y objetos para cada slot de propietario.

No contiene correos, nombres, RUT, claves R2, nombres de archivo, contenido JSON, prompts,
documentos ni bytes de objetos. Los hashes prueban integridad; **no cifran ni anonimizan el
respaldo**. `database.sqlite` y los blobs siguen siendo material clínico sensible en una
operación real.

## Respaldo operativo

Este PR no automatiza el acceso remoto. En producción, un operador autorizado debe:

1. detener escrituras o establecer una ventana consistente;
2. registrar el bookmark de D1 y la versión exacta de la aplicación;
3. exportar D1 y R2 mediante herramientas oficiales de Cloudflare hacia un directorio privado
   y cifrado fuera del repositorio;
4. preservar metadata HTTP y `customMetadata.owner` de cada objeto;
5. comprobar que cada `files.object_key` y `signatures.object_key` tenga exactamente un blob y
   que no existan blobs sin referencia;
6. generar y custodiar conteos y checksums sin copiar valores clínicos a logs o tickets;
7. mantener el respaldo inmutable hasta terminar el ensayo de restauración.

Los identificadores de bindings, tokens y rutas privadas se mantienen en la configuración del
operador; nunca se agregan al repositorio ni al manifiesto.

## Restauración y fallo parcial

Una restauración real debe ejecutarse primero sobre D1/R2 nuevos y desechables:

1. verificar el manifiesto y todos los archivos del respaldo **antes** de modificar el destino;
2. importar D1 y validar migraciones, tablas y relaciones;
3. cargar R2 reconstruyendo metadata de propietario;
4. repetir conteos y checksums contra el manifiesto;
5. comprobar ausencia de huérfanos y mezcla entre propietarios;
6. cambiar los bindings de la aplicación solamente después de aprobar todos los controles.

Si una fase falla, no se continúa con un destino parcial ni se cambia el binding. Se conserva
el respaldo, se registra solo el código y la fase del error, se descarta el destino desechable
y se repite la restauración completa. El ensayo local deja `recovery-state.json` con una fase
acotada y una acción de recuperación, sin valores clínicos.

## Rollback

Antes de promover una restauración se conserva el bookmark D1 y la versión R2 anterior. Si la
validación posterior falla, se vuelve a los bindings previos o al bookmark documentado y se
repite la verificación. Volver solo al código no restaura datos ni objetos.

El drill prueba el mismo principio localmente: altera D1 y un blob después de restaurarlos,
reaplica el respaldo inmutable y exige que todos los checksums originales reaparezcan.

## Custodia segura

- directorio privado con permisos mínimos y almacenamiento cifrado;
- acceso de menor privilegio y registro institucional de quién ejecutó la operación;
- transmisión cifrada y checksum verificado al recibir y antes de restaurar;
- ninguna copia en Git, CI, capturas, correo, tickets o logs;
- retención acotada y eliminación segura conforme a la política institucional;
- separación entre quien produce el respaldo y quien autoriza la promoción restaurada.

La automatización remota, la periodicidad, la retención y la respuesta institucional ante
incidentes siguen siendo responsabilidades operativas fuera de este repositorio.
