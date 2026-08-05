# Integridad de publicación

La unidad de entrega de HHR-documentos es un único artefacto validado. El código probado, el contenido de `dist/` y la versión privada promovida en Sites deben corresponder al mismo commit; no se reconstruye entre validación y publicación.

## Contrato mínimo

Cada `npm run build` genera `dist/client/release.json` con:

- el SHA completo del commit;
- si el checkout contenía cambios sin confirmar;
- la última migración registrada en Drizzle;
- una huella SHA-256 determinista de todo `dist/` —cliente, Worker y configuración de hosting—, excluyendo únicamente el propio manifiesto;
- conteo de archivos y bytes del artefacto.

Antes de compilar se exige un checkout limpio y se captura su commit y esquema. Al finalizar se comprueba que ambos sigan iguales y que el árbol continúe limpio. Esa identidad se escribe en `dist/.openai/release-identity.json` **antes** de calcular la huella, por lo que cambiar el commit declarado también cambia el artefacto medido; el manifiesto público no puede relabelarlo por sí solo.

El manifiesto no guarda nombres, documentos, prompts, credenciales, variables de entorno ni datos clínicos. Si el build ocurre fuera de un checkout Git, el entorno de construcción debe proporcionar `HHR_RELEASE_SHA` con el SHA completo y `HHR_RELEASE_CLEAN=1` únicamente cuando la fuente proviene de un checkout inmutable y verificado. Sin esa procedencia explícita, el artefacto queda marcado como sucio y no puede promocionarse.

## Publicación privada

1. Partir de un commit confirmado y un árbol limpio; `npm run build` rechaza otra condición.
2. Ejecutar `npm run verify`.
3. Volver a ejecutar `npm run build` después del último commit para que `sourceDirty` sea `false`.
4. Ejecutar `npm run release:verify -- --expected-sha <sha-completo>`.
5. Empaquetar ese mismo `dist/` mediante el helper oficial de Sites, reutilizando `.openai/hosting.json`, y conservar el archivo exacto.
6. Guardar la versión declarando como `commit_sha` el mismo SHA verificado.
7. Consultar esa versión en Sites y copiar su `source.commit_sha` y `archive_storage.content_hash`; deben corresponder al commit y al TAR almacenado a partir del archivo local exacto. El verificador descomprime el `.tar.gz` creado por el helper antes de contrastar la huella de Sites.
8. Promover esa misma versión con acceso privado y esperar el estado `succeeded`, comprobando que proyecto, versión y despliegue pertenecen al mismo flujo.
9. Leer `/release.json` desde la URL publicada. Ejecutar `npm run release:verify -- --url <origen> --archive <archivo> --sites-content-hash <huella> --sites-commit-sha <sha> --expected-sha <sha>` con los valores atestiguados por Sites. El verificador extrae el TAR en un directorio desechable, normaliza sus archivos y exige que esa huella coincida con `dist/` y con el manifiesto; después contrasta también el hash externo del TAR almacenado. Rechaza una versión cuyo archivo, commit, manifiesto, esquema o contenido local no coincidan.

Se detiene la promoción si el manifiesto declara cambios sin confirmar, el SHA no coincide, la huella cambia, la migración esperada no coincide o el presupuesto de bundle pierde su margen mínimo.

## Reversión

La reversión reutiliza una versión anterior ya validada; no recompila el código antiguo:

1. Seleccionar la última versión privada sana y registrar su commit y huella.
2. Si no hubo cambio de esquema, volver a promover exactamente esa versión.
3. Si hubo migración, aplicar primero el procedimiento de recuperación y el bookmark documentados en [Migraciones de base de datos](./DATABASE_MIGRATIONS.md); volver solo al código no revierte datos.
4. Confirmar el estado `succeeded` y volver a comprobar `/release.json`.
5. Ejecutar una comprobación funcional breve de Documentos, IA, Formularios, Escáner y vista móvil.

La versión fallida se conserva como evidencia; no se modifica ni se reutiliza con otro commit.
