# Operación de migraciones D1

## Autoridad del esquema

`db/schema.ts` es la definición canónica. Los archivos de `drizzle/` son el historial versionado que Sites aplica antes de servir la nueva versión. Una solicitud HTTP puede consultar y modificar datos de producto, pero nunca crear tablas, alterar columnas, crear índices ni ejecutar compatibilidades históricas.

Para cambiar el esquema:

1. Edite `db/schema.ts`.
2. Ejecute `npm run db:generate -- --name <cambio>`.
3. Revise el SQL generado y mantenga la migración compatible con instalaciones existentes.
4. Ejecute `npm run test:database` y `npm run verify`.
5. Publique juntos el código, la migración, su snapshot y el journal de Drizzle.

No edite una migración ya desplegada. La única excepción histórica es `0001_large_luminals.sql`: este repositorio corrige allí la columna `signatures.is_default` para que una instalación nueva no dependa del antiguo reparador HTTP. Las bases que ya registraron la versión original no la vuelven a ejecutar. Antes de `0005_schema_authority.sql`, `db:prepare` resuelve una sola vez esa diferencia histórica fuera del camino HTTP; la migración versionada completa después índices, destinos de prompts y firmas predeterminadas sin borrar registros.

`0009_ai_trace_privacy.sql` es una limpieza deliberada: elimina `ai_import_runs`, una bitácora operacional redundante que no tenía lectores, y retira `sourceNames` del JSON válido de auditorías históricas `ai_import`. No modifica documentos, archivos, prompts ni la procedencia visible del borrador. Si encuentra metadata histórica que no es JSON válido, la conserva para que la migración no destruya evidencia que no puede interpretar.

## Verificación privada

El verificador acepta una base SQLite o una exportación SQL de D1. Solo informa nombres de controles y cantidades; no imprime identificadores, contenido clínico ni valores de usuarios.

```bash
npm run db:verify -- ./backup.sql
npm run db:verify -- ./database.sqlite
```

Las exportaciones SQL se cargan completas en memoria para verificarlas. Si su tamaño deja de ser manejable, migre este paso a una base temporal en disco o a una importación incremental antes de incorporarlo al flujo de producción.

Comprueba:

- tablas, columnas, índices y migraciones contra el último snapshot de Drizzle;
- versiones documentales inválidas, duplicadas, futuras o sin versión actual;
- relaciones huérfanas entre documentos, versiones, archivos y sesiones móviles;
- exactamente una firma predeterminada por propietario que tenga firmas.
- estados válidos y cierre coherente de la bitácora de ejecuciones de IA.

Antes de aplicar una migración pendiente se puede aceptar un historial que sea prefijo exacto del actual:

```bash
npm run db:verify -- --allow-pending-migrations ./backup-previo.sql
```

Esta opción selecciona el snapshot correspondiente a la última migración aplicada. No tolera versiones desconocidas, migraciones fuera de orden ni divergencias respecto de ese snapshot.

## Despliegue

Los comandos remotos requieren una configuración operativa de Wrangler fuera del repositorio, con el identificador de la D1 real y `migrations_dir` apuntando al directorio `drizzle/` de este checkout. No guarde ese identificador ni credenciales en Git.

1. Valide el artefacto: `npm run verify`.
2. Registre un punto de recuperación inmediatamente anterior:

   ```bash
   wrangler d1 time-travel info <database> --config <operator-config> --json
   ```

3. Cree fuera del checkout un directorio privado para los respaldos:

   ```bash
   BACKUP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hhr-d1-backup.XXXXXX")"
   chmod 700 "$BACKUP_DIR"
   ```

   Los dumps contienen datos clínicos sensibles. Manténgalos en almacenamiento cifrado, limite su retención a esta operación y elimínelos mediante el procedimiento seguro del sistema al terminar. Nunca los copie al repositorio; `.gitignore` también excluye sus tres nombres operativos como defensa adicional.

4. Exporte el respaldo anterior a cualquier cambio:

   ```bash
   wrangler d1 export <database> --remote --config <operator-config> --output "$BACKUP_DIR/backup-previo.sql" -y
   ```

5. Ejecute el puente preparatorio idempotente para instalaciones que registraron el antiguo `0001` sin recibir su reparación HTTP:

   ```bash
   npm run db:prepare -- --database <database> --config <operator-config>
   wrangler d1 export <database> --remote --config <operator-config> --output "$BACKUP_DIR/backup-preparado.sql" -y
   npm run db:verify -- --allow-pending-migrations "$BACKUP_DIR/backup-preparado.sql"
   ```

   El comando consulta únicamente `PRAGMA table_info(signatures)`. Si falta `is_default`, añade la columna con valor inicial `0`; en ambos casos asegura el índice parcial correcto. No lee ni imprime filas de firmas.

6. Aplique explícitamente las migraciones antes de desplegar el Worker y confirme que no quedan pendientes:

   ```bash
   wrangler d1 migrations apply <database> --remote --config <operator-config>
   wrangler d1 migrations list <database> --remote --config <operator-config>
   ```

   Detenga aquí la promoción si `0005_schema_authority.sql` y la migración más reciente (`0009_ai_trace_privacy.sql`) no aparecen aplicadas. El despliegue de Sites no sustituye este bloqueo operativo.

7. Despliegue mediante Sites reutilizando `.openai/hosting.json`.
8. Verifique una exportación posterior sin permitir pendientes:

   ```bash
   wrangler d1 migrations list <database> --remote --config <operator-config>
   wrangler d1 export <database> --remote --config <operator-config> --output "$BACKUP_DIR/backup-posterior.sql" -y
   npm run db:verify -- "$BACKUP_DIR/backup-posterior.sql"
   ```

No promueva la versión si la migración más reciente no aparece aplicada o si el verificador informa hallazgos. Cuando finalice la ventana de recuperación, elimine los tres dumps y el directorio temporal con el procedimiento seguro definido para el equipo.

## Rollback y recuperación

Una migración D1 se ejecuta como una unidad: si falla, no debe registrarse en `d1_migrations` y permanece aplicada la última versión exitosa. Ante un fallo:

1. Detenga la promoción del Worker nuevo.
2. Consulte `wrangler d1 migrations list` y conserve el error completo.
3. No cree columnas desde una ruta HTTP ni inserte manualmente filas en `d1_migrations`; la única preparación admitida es `db:prepare` antes de `0005`.
4. Corrija la migración pendiente y vuelva a ensayarla sobre una copia desechable del respaldo.

Si una migración aplicada produjo daño, revierta juntos datos y aplicación al punto anterior. Time Travel modifica la base remota: confirme el nombre, el bookmark y la ventana antes de ejecutar el restore.

La reversión de `0009` debe usar el bookmark o respaldo previo: volver solo al código anterior no recrea `ai_import_runs` ni restaura los nombres retirados de auditorías históricas.

```bash
wrangler d1 time-travel restore <database> \
  --bookmark <bookmark-previo> \
  --config <operator-config>
```

Después de restaurar, vuelva a exportar y compare el historial y los conteos de integridad. Revertir solo el código no deshace una transformación de datos.

## Ensayo desechable

`npm run test:database` construye una instalación vacía, actualiza las cuatro versiones históricas y los cortes canónicos `0005`, `0007` y `0008`, conserva sus registros salvo las normalizaciones explícitas, comprueba la limpieza privada de `0009`, provoca divergencias para probar el verificador y restaura exactamente el estado lógico previo —incluida la bitácora retirada— desde una copia desechable. No usa la D1 remota ni datos reales.
