import { DatabaseSync } from "node:sqlite";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { verifyDatabase } from "../verify-database-integrity.mjs";
import {
  RECOVERY_FORMAT,
  assertRecoveryManifest,
  canonicalJson,
  compareDatabaseInventory,
  databaseInventory,
  databasePayloadSha256,
  ownerSlots,
  ownershipInventory,
  sha256,
} from "./manifest.mjs";
import { LocalR2Store } from "./local-r2.mjs";

const WORKSPACE_PREFIX = "hhr-recovery-drill-";
const WORKSPACE_MARKER = "HHR_RECOVERY_DRILL_ONLY\n";
const STATE_NAME = "recovery-state.json";

export class RecoveryIntegrityError extends Error {
  constructor(findings) {
    super(`La recuperación no supera los controles: ${findings.map((finding) => finding.check).join(", ")}.`);
    this.name = "RecoveryIntegrityError";
    this.code = "RECOVERY_INTEGRITY_FAILED";
    this.findings = findings;
  }
}

function count(db, sql) {
  return Number(db.prepare(sql).get()?.count ?? 0);
}

function relationFindings(db) {
  const checks = [
    {
      check: "ownership.document_files",
      sql: `SELECT COUNT(*) AS count FROM document_files AS link
        JOIN documents AS document ON document.id = link.document_id
        JOIN files AS file ON file.id = link.file_id
        WHERE document.owner_email <> file.owner_email`,
    },
    {
      check: "orphan.template_prompt",
      sql: `SELECT COUNT(*) AS count FROM document_template_settings AS setting
        LEFT JOIN ai_prompts AS prompt ON prompt.id = setting.prompt_id
        WHERE setting.prompt_id IS NOT NULL AND prompt.id IS NULL`,
    },
    {
      check: "ownership.template_prompt",
      sql: `SELECT COUNT(*) AS count FROM document_template_settings AS setting
        JOIN ai_prompts AS prompt ON prompt.id = setting.prompt_id
        WHERE setting.owner_email <> prompt.owner_email`,
    },
  ];
  return checks.flatMap((item) => {
    const result = count(db, item.sql);
    return result ? [{ check: item.check, count: result }] : [];
  });
}

function objectReferences(db) {
  return db.prepare(`SELECT object_key AS objectKey, owner_email AS owner, mime_type AS contentType,
      size, 'file' AS kind FROM files
    UNION ALL
    SELECT object_key AS objectKey, owner_email AS owner, mime_type AS contentType,
      size, kind FROM signatures
    ORDER BY objectKey`).all().map((row) => ({
    ...row,
    size: Number(row.size),
  }));
}

function objectFindings(references, objects) {
  const findings = [];
  const referenceGroups = Map.groupBy(references, (item) => item.objectKey);
  const describedObjects = objects.filter((item) => typeof item.key === "string");
  const objectGroups = Map.groupBy(describedObjects, (item) => item.key);
  for (const group of referenceGroups.values()) {
    if (group.length > 1) findings.push({ check: "r2.duplicate_reference", count: group.length });
  }
  for (const group of objectGroups.values()) {
    if (group.length > 1) findings.push({ check: "r2.duplicate_object", count: group.length });
  }
  for (const object of objects) {
    if (object.metadataMissing) {
      findings.push({ check: "r2.missing_metadata", count: 1 });
      findings.push({ check: "r2.unreferenced_object", count: 1 });
      continue;
    }
    if (object.storageId !== sha256(object.key) || object.metadataId !== object.storageId) {
      findings.push({ check: "r2.invalid_storage_id", count: 1 });
    }
    if (!referenceGroups.has(object.key)) findings.push({ check: "r2.unreferenced_object", count: 1 });
  }
  for (const reference of references) {
    const matches = objectGroups.get(reference.objectKey) ?? [];
    if (!matches.length) {
      findings.push({ check: "r2.missing_object", count: 1 });
      continue;
    }
    if (matches.length !== 1) continue;
    const object = matches[0];
    if (object.missing) findings.push({ check: "r2.missing_blob", count: 1 });
    if (object.owner !== reference.owner) findings.push({ check: "r2.owner_mismatch", count: 1 });
    if (object.contentType !== reference.contentType) findings.push({ check: "r2.content_type_mismatch", count: 1 });
    if (!object.missing && object.size !== reference.size) findings.push({ check: "r2.size_mismatch", count: 1 });
  }
  return findings;
}

function ensureInside(root, target) {
  const path = resolve(target);
  const difference = relative(resolve(root), path);
  if (difference === "" || (!difference.startsWith(`..${sep}`) && difference !== ".." && !isAbsolute(difference))) return path;
  throw new Error("La ruta de recuperación sale del entorno desechable.");
}

async function assertDisposableWorkspace(workspace) {
  const root = resolve(workspace.root);
  if (!basename(root).startsWith(WORKSPACE_PREFIX)) throw new Error("El entorno no tiene el prefijo desechable requerido.");
  const [resolvedRoot, resolvedTmp] = await Promise.all([realpath(root), realpath(tmpdir())]);
  if (dirname(resolvedRoot) !== resolvedTmp) throw new Error("El entorno no fue creado directamente en el directorio temporal.");
  let marker;
  try {
    marker = await readFile(join(root, ".hhr-recovery-drill"), "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (marker !== WORKSPACE_MARKER) {
    throw new Error("Falta el marcador de seguridad del ensayo.");
  }
  for (const path of [workspace.liveRoot, workspace.backupRoot, workspace.databasePath, workspace.r2Root]) {
    ensureInside(root, path);
  }
}

export async function createDisposableRecoveryWorkspace() {
  const root = await mkdtemp(join(tmpdir(), WORKSPACE_PREFIX));
  const workspace = {
    root,
    liveRoot: join(root, "live"),
    backupRoot: join(root, "backup"),
    databasePath: join(root, "live", "database.sqlite"),
    r2Root: join(root, "live", "r2"),
    statePath: join(root, STATE_NAME),
  };
  await writeFile(join(root, ".hhr-recovery-drill"), WORKSPACE_MARKER, { mode: 0o600 });
  await mkdir(workspace.liveRoot, { recursive: true, mode: 0o700 });
  return workspace;
}

export async function destroyDisposableLiveData(workspace) {
  await assertDisposableWorkspace(workspace);
  await rm(ensureInside(workspace.root, workspace.liveRoot), { recursive: true, force: true });
}

export async function cleanupDisposableRecoveryWorkspace(workspace) {
  await assertDisposableWorkspace(workspace);
  await rm(resolve(workspace.root), { recursive: true, force: true });
}

export async function inspectRecoverySource(workspace) {
  await assertDisposableWorkspace(workspace);
  const db = new DatabaseSync(workspace.databasePath, { readOnly: true });
  try {
    const databaseCheck = await verifyDatabase(db);
    const references = objectReferences(db);
    const objects = await new LocalR2Store(workspace.r2Root).list();
    const slots = ownerSlots(db);
    return {
      database: databaseInventory(db),
      ownership: ownershipInventory(db, slots),
      slots,
      references,
      objects,
      findings: [
        ...databaseCheck.findings,
        ...relationFindings(db),
        ...objectFindings(references, objects),
      ],
    };
  } finally {
    db.close();
  }
}

function throwOnFindings(findings) {
  if (findings.length) throw new RecoveryIntegrityError(findings);
}

function manifestObjects(snapshot) {
  const objects = new Map(snapshot.objects.map((object) => [object.key, object]));
  return snapshot.references.map((reference) => {
    const object = objects.get(reference.objectKey);
    return {
      keySha256: sha256(reference.objectKey),
      contentSha256: object.contentSha256,
      size: object.size,
      ownerSlot: snapshot.slots.get(reference.owner),
      kind: String(reference.kind),
      contentType: String(reference.contentType),
    };
  }).toSorted((left, right) => (
    left.keySha256 < right.keySha256 ? -1 : left.keySha256 > right.keySha256 ? 1 : 0
  ));
}

export async function exportRecoveryBackup(workspace, { createdAt = new Date().toISOString() } = {}) {
  await assertDisposableWorkspace(workspace);
  const snapshot = await inspectRecoverySource(workspace);
  throwOnFindings(snapshot.findings);
  await rm(workspace.backupRoot, { recursive: true, force: true });
  const objectsRoot = join(workspace.backupRoot, "objects");
  await mkdir(objectsRoot, { recursive: true, mode: 0o700 });
  const databasePath = join(workspace.backupRoot, "database.sqlite");
  await copyFile(workspace.databasePath, databasePath);
  await chmod(databasePath, 0o600);

  const sourceObjects = new Map(snapshot.objects.map((object) => [object.key, object]));
  for (const reference of snapshot.references) {
    const object = sourceObjects.get(reference.objectKey);
    const target = join(objectsRoot, `${sha256(reference.objectKey)}.blob`);
    await copyFile(object.blobPath, target);
    await chmod(target, 0o600);
  }
  const objectManifest = manifestObjects(snapshot);
  const objectCounts = Map.groupBy(objectManifest, (object) => object.ownerSlot);
  const manifest = {
    format: RECOVERY_FORMAT,
    createdAt,
    database: {
      payloadSha256: await databasePayloadSha256(databasePath),
      ...snapshot.database,
    },
    objects: objectManifest,
    ownership: snapshot.ownership.map((owner) => ({
      ...owner,
      objects: objectCounts.get(owner.slot)?.length ?? 0,
    })),
  };
  assertRecoveryManifest(manifest);
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(workspace.backupRoot, "manifest.json"), manifestBytes, { mode: 0o600 });
  return { manifest, manifestSha256: sha256(manifestBytes) };
}

async function readBackupManifest(workspace) {
  await assertDisposableWorkspace(workspace);
  return assertRecoveryManifest(JSON.parse(await readFile(join(workspace.backupRoot, "manifest.json"), "utf8")));
}

function compareOwnership(expected, actual) {
  return canonicalJson(expected) === canonicalJson(actual)
    ? []
    : [{ check: "ownership.inventory", count: 1 }];
}

async function backupObjectFindings(workspace, manifest) {
  const objectsRoot = join(workspace.backupRoot, "objects");
  const expectedFiles = new Set(manifest.objects.map((object) => `${object.keySha256}.blob`));
  let actualFiles = [];
  try {
    actualFiles = (await readdir(objectsRoot)).toSorted();
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const findings = [];
  for (const name of new Set([...expectedFiles, ...actualFiles])) {
    if (!expectedFiles.has(name)) findings.push({ check: "backup.unexpected_object", count: 1 });
    if (!actualFiles.includes(name)) findings.push({ check: "backup.missing_object", count: 1 });
  }
  for (const object of manifest.objects) {
    const path = join(objectsRoot, `${object.keySha256}.blob`);
    try {
      const bytes = await readFile(path);
      if (bytes.byteLength !== object.size) findings.push({ check: "backup.object_size", count: 1 });
      if (sha256(bytes) !== object.contentSha256) findings.push({ check: "backup.object_checksum", count: 1 });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return findings;
}

export async function verifyRecoveryBackup(workspace) {
  const manifest = await readBackupManifest(workspace);
  const databasePath = join(workspace.backupRoot, "database.sqlite");
  const findings = [];
  try {
    if (await databasePayloadSha256(databasePath) !== manifest.database.payloadSha256) {
      findings.push({ check: "backup.database_checksum", count: 1 });
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    findings.push({ check: "backup.database_missing", count: 1 });
    return { manifest, findings };
  }
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const databaseCheck = await verifyDatabase(db);
    const slots = ownerSlots(db);
    const references = objectReferences(db);
    const expectedObjects = new Map(manifest.objects.map((object) => [object.keySha256, object]));
    findings.push(
      ...databaseCheck.findings,
      ...relationFindings(db),
      ...compareDatabaseInventory(manifest.database, databaseInventory(db)),
      ...compareOwnership(manifest.ownership, ownershipInventory(db, slots).map((owner) => ({
        ...owner,
        objects: references.filter((reference) => slots.get(reference.owner) === owner.slot).length,
      }))),
    );
    for (const reference of references) {
      const object = expectedObjects.get(sha256(reference.objectKey));
      if (!object) {
        findings.push({ check: "backup.reference_missing", count: 1 });
        continue;
      }
      if (object.ownerSlot !== slots.get(reference.owner)) findings.push({ check: "backup.owner_mismatch", count: 1 });
      if (object.kind !== reference.kind) findings.push({ check: "backup.kind_mismatch", count: 1 });
      if (object.contentType !== reference.contentType) findings.push({ check: "backup.content_type_mismatch", count: 1 });
      if (object.size !== reference.size) findings.push({ check: "backup.reference_size", count: 1 });
    }
    if (references.length !== manifest.objects.length) findings.push({ check: "backup.object_count", count: 1 });
  } finally {
    db.close();
  }
  findings.push(...await backupObjectFindings(workspace, manifest));
  return { manifest, findings };
}

async function writeRecoveryState(workspace, state) {
  await writeFile(workspace.statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

export async function readRecoveryState(workspace) {
  await assertDisposableWorkspace(workspace);
  return JSON.parse(await readFile(workspace.statePath, "utf8"));
}

async function verifyRestoredSource(workspace, manifest) {
  const snapshot = await inspectRecoverySource(workspace);
  const findings = [
    ...snapshot.findings,
    ...compareDatabaseInventory(manifest.database, snapshot.database),
    ...compareOwnership(manifest.ownership, snapshot.ownership.map((owner) => ({
      ...owner,
      objects: snapshot.references.filter((reference) => snapshot.slots.get(reference.owner) === owner.slot).length,
    }))),
  ];
  const manifestObjectsByKey = new Map(manifest.objects.map((object) => [object.keySha256, object]));
  for (const reference of snapshot.references) {
    const actual = snapshot.objects.find((object) => object.key === reference.objectKey);
    const expected = manifestObjectsByKey.get(sha256(reference.objectKey));
    if (!actual || !expected) {
      findings.push({ check: "restore.object_missing", count: 1 });
      continue;
    }
    if (actual.contentSha256 !== expected.contentSha256) findings.push({ check: "restore.object_checksum", count: 1 });
    if (snapshot.slots.get(reference.owner) !== expected.ownerSlot) findings.push({ check: "restore.object_owner", count: 1 });
  }
  if (await databasePayloadSha256(workspace.databasePath) !== manifest.database.payloadSha256) {
    findings.push({ check: "restore.database_payload", count: 1 });
  }
  return { snapshot, findings };
}

export async function restoreRecoveryBackup(workspace, { failAfterPhase } = {}) {
  await assertDisposableWorkspace(workspace);
  const backupCheck = await verifyRecoveryBackup(workspace);
  throwOnFindings(backupCheck.findings);
  const { manifest } = backupCheck;
  let phase = "validated";
  try {
    await writeRecoveryState(workspace, {
      status: "running",
      phase,
      recoveryAction: "Repetir la restauración local con el mismo respaldo verificado.",
    });
    await destroyDisposableLiveData(workspace);
    await mkdir(workspace.liveRoot, { recursive: true, mode: 0o700 });
    await copyFile(join(workspace.backupRoot, "database.sqlite"), workspace.databasePath);
    await chmod(workspace.databasePath, 0o600);
    phase = "database_restored";
    await writeRecoveryState(workspace, {
      status: "running",
      phase,
      recoveryAction: "Repetir la restauración local con el mismo respaldo verificado.",
    });
    if (failAfterPhase === "database") {
      const error = new Error("Fallo sintético después de restaurar D1.");
      error.code = "SYNTHETIC_PARTIAL_FAILURE";
      throw error;
    }

    const db = new DatabaseSync(workspace.databasePath, { readOnly: true });
    let references;
    try {
      references = objectReferences(db);
    } finally {
      db.close();
    }
    const objects = new Map(manifest.objects.map((object) => [object.keySha256, object]));
    const r2 = new LocalR2Store(workspace.r2Root);
    for (const reference of references) {
      const digest = sha256(reference.objectKey);
      const object = objects.get(digest);
      await r2.put(
        reference.objectKey,
        await readFile(join(workspace.backupRoot, "objects", `${digest}.blob`)),
        { owner: reference.owner, contentType: object.contentType },
      );
    }
    phase = "objects_restored";
    await writeRecoveryState(workspace, {
      status: "running",
      phase,
      recoveryAction: "Repetir la restauración local con el mismo respaldo verificado.",
    });
    const restored = await verifyRestoredSource(workspace, manifest);
    throwOnFindings(restored.findings);
    phase = "verified";
    await writeRecoveryState(workspace, {
      status: "verified",
      phase,
      tables: manifest.database.tables.length,
      objects: manifest.objects.length,
      recoveryAction: null,
    });
    return {
      tables: manifest.database.tables.length,
      rows: manifest.database.tables.reduce((sum, table) => sum + table.rows, 0),
      objects: manifest.objects.length,
      owners: manifest.ownership.length,
      checksumsVerified: manifest.database.tables.length + manifest.objects.length + 2,
    };
  } catch (error) {
    await writeRecoveryState(workspace, {
      status: "restore_failed",
      phase,
      errorCode: typeof error?.code === "string" ? error.code : "RESTORE_FAILED",
      recoveryAction: "Conservar el respaldo, corregir la causa y repetir la restauración local completa.",
    });
    throw error;
  }
}

export async function disposableLiveDataExists(workspace) {
  await assertDisposableWorkspace(workspace);
  try {
    await stat(workspace.databasePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
