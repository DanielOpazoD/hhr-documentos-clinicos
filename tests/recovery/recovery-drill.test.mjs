import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { LocalR2Store } from "../../scripts/recovery/local-r2.mjs";
import {
  RecoveryIntegrityError,
  cleanupDisposableRecoveryWorkspace,
  destroyDisposableLiveData,
  disposableLiveDataExists,
  exportRecoveryBackup,
  inspectRecoverySource,
  readRecoveryState,
  restoreRecoveryBackup,
  verifyRecoveryBackup,
} from "../../scripts/recovery/recovery.mjs";
import { createSyntheticRecoveryScenario } from "../../scripts/recovery/synthetic-scenario.mjs";

const syntheticBackupTime = "2026-08-01T12:10:00.000Z";

async function scenarioFor(testContext) {
  const scenario = await createSyntheticRecoveryScenario();
  testContext.after(() => cleanupDisposableRecoveryWorkspace(scenario.workspace));
  return scenario;
}

function findingChecks(result) {
  return new Set(result.findings.map((finding) => finding.check));
}

test("backs up, destroys, restores and rolls back every synthetic D1/R2 checksum", async (t) => {
  const scenario = await scenarioFor(t);
  const source = await inspectRecoverySource(scenario.workspace);
  assert.deepEqual(source.findings, []);
  assert.equal(source.slots.size, 2);
  assert.equal(source.references.length, 8);

  const backup = await exportRecoveryBackup(scenario.workspace, { createdAt: syntheticBackupTime });
  const manifestText = await readFile(`${scenario.workspace.backupRoot}/manifest.json`, "utf8");
  for (const marker of scenario.privateMarkers) assert.equal(manifestText.includes(marker), false, marker);
  assert.doesNotMatch(manifestText, /ownerEmail|objectKey|patientName|contentJson/);
  assert.equal(backup.manifest.ownership.length, 2);
  assert.equal(backup.manifest.objects.length, 8);
  assert.deepEqual((await verifyRecoveryBackup(scenario.workspace)).findings, []);

  await destroyDisposableLiveData(scenario.workspace);
  assert.equal(await disposableLiveDataExists(scenario.workspace), false);
  const restored = await restoreRecoveryBackup(scenario.workspace);
  assert.equal(restored.owners, 2);
  assert.equal(restored.objects, 8);
  assert.ok(restored.checksumsVerified > 8);
  assert.deepEqual(await readRecoveryState(scenario.workspace), {
    status: "verified",
    phase: "verified",
    tables: backup.manifest.database.tables.length,
    objects: 8,
    recoveryAction: null,
  });

  const db = new DatabaseSync(scenario.workspace.databasePath);
  try {
    db.prepare("UPDATE documents SET title = ? WHERE id = ?").run("Mutación descartable", "document-a");
  } finally {
    db.close();
  }
  await new LocalR2Store(scenario.workspace.r2Root).put(
    scenario.objects[0].key,
    Buffer.from("mutated-disposable-object"),
    { owner: scenario.objects[0].owner, contentType: scenario.objects[0].contentType },
  );
  const rolledBack = await restoreRecoveryBackup(scenario.workspace);
  assert.equal(rolledBack.checksumsVerified, restored.checksumsVerified);
  assert.deepEqual((await inspectRecoverySource(scenario.workspace)).findings, []);
});

test("detects a referenced R2 object whose blob is missing", async (t) => {
  const scenario = await scenarioFor(t);
  await new LocalR2Store(scenario.workspace.r2Root).deleteBlob(scenario.objects[0].key);
  const result = await inspectRecoverySource(scenario.workspace);
  assert.equal(findingChecks(result).has("r2.missing_blob"), true);
  await assert.rejects(
    exportRecoveryBackup(scenario.workspace, { createdAt: syntheticBackupTime }),
    (error) => error instanceof RecoveryIntegrityError
      && error.findings.some((finding) => finding.check === "r2.missing_blob"),
  );
});

test("detects duplicate R2 keys instead of silently overwriting them", async (t) => {
  const scenario = await scenarioFor(t);
  await new LocalR2Store(scenario.workspace.r2Root).duplicateObject(scenario.objects[0].key);
  const checks = findingChecks(await inspectRecoverySource(scenario.workspace));
  assert.equal(checks.has("r2.duplicate_object"), true);
  assert.equal(checks.has("r2.invalid_storage_id"), true);
});

test("detects a physical R2 blob that has no metadata", async (t) => {
  const scenario = await scenarioFor(t);
  await new LocalR2Store(scenario.workspace.r2Root).putBlobWithoutMetadata(
    Buffer.from("synthetic-metadata-less-blob"),
  );
  const checks = findingChecks(await inspectRecoverySource(scenario.workspace));
  assert.equal(checks.has("r2.missing_metadata"), true);
  assert.equal(checks.has("r2.unreferenced_object"), true);
});

test("detects orphan links and cross-owner document attachments", async (t) => {
  const scenario = await scenarioFor(t);
  let db = new DatabaseSync(scenario.workspace.databasePath);
  try {
    db.prepare("UPDATE document_files SET file_id = ? WHERE id = ?").run("missing-file", "link-file-a-desktop");
  } finally {
    db.close();
  }
  assert.equal(findingChecks(await inspectRecoverySource(scenario.workspace)).has("orphan.document_files"), true);

  db = new DatabaseSync(scenario.workspace.databasePath);
  try {
    db.prepare("UPDATE document_files SET file_id = ? WHERE id = ?").run("file-b-desktop", "link-file-a-desktop");
  } finally {
    db.close();
  }
  assert.equal(findingChecks(await inspectRecoverySource(scenario.workspace)).has("ownership.document_files"), true);
});

test("records a safe partial failure and resumes from the untouched backup", async (t) => {
  const scenario = await scenarioFor(t);
  await exportRecoveryBackup(scenario.workspace, { createdAt: syntheticBackupTime });
  await destroyDisposableLiveData(scenario.workspace);
  await assert.rejects(
    restoreRecoveryBackup(scenario.workspace, { failAfterPhase: "database" }),
    (error) => error?.code === "SYNTHETIC_PARTIAL_FAILURE",
  );
  const failed = await readRecoveryState(scenario.workspace);
  assert.equal(failed.status, "restore_failed");
  assert.equal(failed.phase, "database_restored");
  assert.equal(failed.errorCode, "SYNTHETIC_PARTIAL_FAILURE");
  assert.match(failed.recoveryAction, /Conservar el respaldo/);
  assert.deepEqual((await verifyRecoveryBackup(scenario.workspace)).findings, []);

  const resumed = await restoreRecoveryBackup(scenario.workspace);
  assert.equal(resumed.objects, 8);
  assert.equal((await readRecoveryState(scenario.workspace)).status, "verified");
});

test("blocks a tampered owner assignment before destroying the current local data", async (t) => {
  const scenario = await scenarioFor(t);
  await exportRecoveryBackup(scenario.workspace, { createdAt: syntheticBackupTime });
  const manifestPath = `${scenario.workspace.backupRoot}/manifest.json`;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.objects[0].ownerSlot = manifest.objects[0].ownerSlot === "owner-001"
    ? "owner-002"
    : "owner-001";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

  assert.equal(findingChecks(await verifyRecoveryBackup(scenario.workspace)).has("backup.owner_mismatch"), true);
  await assert.rejects(
    restoreRecoveryBackup(scenario.workspace),
    (error) => error instanceof RecoveryIntegrityError
      && error.findings.some((finding) => finding.check === "backup.owner_mismatch"),
  );
  assert.equal(await disposableLiveDataExists(scenario.workspace), true);
});

test("rejects a manifest with duplicate table descriptors", async (t) => {
  const scenario = await scenarioFor(t);
  await exportRecoveryBackup(scenario.workspace, { createdAt: syntheticBackupTime });
  const manifestPath = `${scenario.workspace.backupRoot}/manifest.json`;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.database.tables.push(structuredClone(manifest.database.tables[0]));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await assert.rejects(verifyRecoveryBackup(scenario.workspace), /manifest\.duplicate_table/);
});

test("rejects a backup object whose bytes were modified", async (t) => {
  const scenario = await scenarioFor(t);
  const backup = await exportRecoveryBackup(scenario.workspace, { createdAt: syntheticBackupTime });
  const [object] = backup.manifest.objects;
  const blobPath = join(scenario.workspace.backupRoot, "objects", `${object.keySha256}.blob`);
  const original = await readFile(blobPath);
  await writeFile(blobPath, Buffer.concat([original, Buffer.from("!")]), { mode: 0o600 });

  const checks = findingChecks(await verifyRecoveryBackup(scenario.workspace));
  assert.equal(checks.has("backup.object_checksum"), true);
  assert.equal(checks.has("backup.object_size"), true);
  await assert.rejects(
    restoreRecoveryBackup(scenario.workspace),
    (error) => error instanceof RecoveryIntegrityError,
  );
  assert.equal(await disposableLiveDataExists(scenario.workspace), true);
});

test("refuses destructive work when the drill marker is missing", async (t) => {
  const scenario = await scenarioFor(t);
  const markerPath = join(scenario.workspace.root, ".hhr-recovery-drill");
  await rm(markerPath);
  try {
    await assert.rejects(destroyDisposableLiveData(scenario.workspace), /marcador de seguridad/);
    await assert.rejects(disposableLiveDataExists(scenario.workspace), /marcador de seguridad/);
  } finally {
    await writeFile(markerPath, "HHR_RECOVERY_DRILL_ONLY\n", { mode: 0o600 });
  }
});

test("refuses destructive work outside the direct system temporary directory", async (t) => {
  const scenario = await scenarioFor(t);
  const nestedRoot = await mkdtemp(join(scenario.workspace.liveRoot, "hhr-recovery-drill-"));
  const nested = {
    root: nestedRoot,
    liveRoot: join(nestedRoot, "live"),
    backupRoot: join(nestedRoot, "backup"),
    databasePath: join(nestedRoot, "live", "database.sqlite"),
    r2Root: join(nestedRoot, "live", "r2"),
  };
  await writeFile(join(nestedRoot, ".hhr-recovery-drill"), "HHR_RECOVERY_DRILL_ONLY\n", { mode: 0o600 });
  try {
    await assert.rejects(destroyDisposableLiveData(nested), /directamente en el directorio temporal/);
  } finally {
    await rm(nestedRoot, { recursive: true, force: true });
  }
});

test("refuses destructive work without the disposable workspace marker", async () => {
  const fake = {
    root: "/tmp/not-an-hhr-recovery-workspace",
    liveRoot: "/tmp/not-an-hhr-recovery-workspace/live",
    backupRoot: "/tmp/not-an-hhr-recovery-workspace/backup",
    databasePath: "/tmp/not-an-hhr-recovery-workspace/live/database.sqlite",
    r2Root: "/tmp/not-an-hhr-recovery-workspace/live/r2",
  };
  await assert.rejects(destroyDisposableLiveData(fake), /prefijo desechable/);
});
