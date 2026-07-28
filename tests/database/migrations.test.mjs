import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { prepareLegacySignatureSchema } from "../../scripts/prepare-legacy-schema.mjs";
import { verifyDatabase } from "../../scripts/verify-database-integrity.mjs";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const migrationsRoot = join(projectRoot, "drizzle");
const temporaryRoot = await mkdtemp(join(tmpdir(), "hhr-schema-authority-"));
const journal = JSON.parse(await readFile(join(migrationsRoot, "meta", "_journal.json"), "utf8"));
const migrationNames = journal.entries.map((entry) => `${entry.tag}.sql`);

after(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

function migrationPath(name) {
  return join(migrationsRoot, name);
}

function createDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);
  return db;
}

function applyMigration(db, name, sql) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(sql);
    db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function applyRepositoryMigration(db, name) {
  applyMigration(db, name, await readFile(migrationPath(name), "utf8"));
}

async function applyPendingMigrations(db) {
  const applied = new Set(db.prepare("SELECT name FROM d1_migrations").all().map((row) => row.name));
  for (const name of migrationNames) {
    if (!applied.has(name)) await applyRepositoryMigration(db, name);
  }
}

function legacySignatureMigration(sql) {
  const withoutColumn = sql.replace("\n\t`is_default` integer DEFAULT false NOT NULL,", "");
  assert.notEqual(withoutColumn, sql, "No se encontró la columna histórica en 0001.");
  const withoutIndex = withoutColumn.replace(
    /\n--> statement-breakpoint\nCREATE UNIQUE INDEX `signatures_owner_default_idx`[^;]+;\s*$/,
    "",
  );
  assert.notEqual(withoutIndex, withoutColumn, "No se encontró el índice histórico en 0001.");
  return withoutIndex;
}

function emulateLegacyRequestSchema(db) {
  db.exec(`
    ALTER TABLE signatures ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
    CREATE UNIQUE INDEX signatures_owner_default_idx
      ON signatures(owner_email) WHERE is_default = 1;
    CREATE TABLE IF NOT EXISTS ai_prompts (
      id TEXT PRIMARY KEY NOT NULL,
      owner_email TEXT NOT NULL,
      name TEXT NOT NULL,
      target_type TEXT NOT NULL,
      instructions TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ai_prompts_owner_target_default_idx
      ON ai_prompts(owner_email, target_type) WHERE is_default = 1;
    CREATE INDEX IF NOT EXISTS documents_owner_updated_idx
      ON documents(owner_email, updated_at DESC);
    CREATE INDEX IF NOT EXISTS files_owner_created_idx
      ON files(owner_email, created_at DESC);
    CREATE INDEX IF NOT EXISTS signatures_owner_updated_idx
      ON signatures(owner_email, updated_at DESC);
    CREATE INDEX IF NOT EXISTS ai_prompts_owner_target_idx
      ON ai_prompts(owner_email, target_type, updated_at DESC);
    CREATE INDEX IF NOT EXISTS sessions_token_idx
      ON mobile_upload_sessions(token_hash);
  `);
}

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().some((entry) => entry.name === column);
}

function seedData(db, { legacy }) {
  const createdAt = "2026-07-01T12:00:00.000Z";
  const updatedAt = "2026-07-02T12:00:00.000Z";
  db.prepare("INSERT INTO users VALUES (?, ?, ?, ?)")
    .run("owner@hhr.test", "Profesional Prueba", createdAt, updatedAt);
  db.prepare(`INSERT INTO documents
    (id, owner_email, template_id, title, patient_name, patient_rut_masked, status, content_json, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("document-1", "owner@hhr.test", "documento_libre", "Documento conservado", "Persona Prueba", "XX.XXX.XXX-X", "Borrador", "{\"sections\":[]}", 1, createdAt, updatedAt);

  const versionColumns = hasColumn(db, "document_versions", "snapshot_json")
    ? "id, document_id, owner_email, version, content_json, snapshot_json, created_at"
    : "id, document_id, owner_email, version, content_json, created_at";
  const versionValues = hasColumn(db, "document_versions", "snapshot_json")
    ? ["version-1", "document-1", "owner@hhr.test", 1, "{\"sections\":[]}", "{\"title\":\"Documento conservado\"}", createdAt]
    : ["version-1", "document-1", "owner@hhr.test", 1, "{\"sections\":[]}", createdAt];
  db.prepare(`INSERT INTO document_versions (${versionColumns}) VALUES (${versionValues.map(() => "?").join(",")})`)
    .run(...versionValues);

  db.prepare(`INSERT INTO mobile_upload_sessions
    (id, owner_email, token_hash, expires_at, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run("session-1", "owner@hhr.test", "token-hash-1", "2026-08-01T12:00:00.000Z", "revocada", createdAt, updatedAt);
  const fileColumns = hasColumn(db, "files", "mobile_session_id")
    ? "id, owner_email, mobile_session_id, object_key, name, mime_type, size, origin, status, patient_id, created_at, updated_at"
    : "id, owner_email, object_key, name, mime_type, size, origin, status, patient_id, created_at, updated_at";
  const fileValues = hasColumn(db, "files", "mobile_session_id")
    ? ["file-1", "owner@hhr.test", "session-1", "files/file-1", "archivo.pdf", "application/pdf", 128, "QR móvil", "activo", null, createdAt, updatedAt]
    : ["file-1", "owner@hhr.test", "files/file-1", "archivo.pdf", "application/pdf", 128, "Escritorio", "activo", null, createdAt, updatedAt];
  db.prepare(`INSERT INTO files (${fileColumns}) VALUES (${fileValues.map(() => "?").join(",")})`)
    .run(...fileValues);
  db.prepare("INSERT INTO document_files VALUES (?, ?, ?, ?)")
    .run("link-1", "document-1", "file-1", createdAt);

  if (hasColumn(db, "signatures", "is_default")) {
    const insertSignature = db.prepare(`INSERT INTO signatures
      (id, owner_email, professional_name, professional_rut, specialty, object_key, mime_type, size, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertSignature.run("signature-selected", "signer-a@hhr.test", "Profesional A", "11.111.111-1", "Medicina", "signatures/a", "image/png", 64, 1, createdAt, createdAt);
    insertSignature.run("signature-newer", "signer-a@hhr.test", "Profesional A", "11.111.111-1", "Medicina", "signatures/b", "image/png", 64, 0, createdAt, updatedAt);
    insertSignature.run("signature-missing-default", "signer-b@hhr.test", "Profesional B", "22.222.222-2", "Medicina", "signatures/c", "image/png", 64, legacy ? 0 : 1, createdAt, updatedAt);
  } else {
    const insertLegacySignature = db.prepare(`INSERT INTO signatures
      (id, owner_email, professional_name, professional_rut, specialty, object_key, mime_type, size, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertLegacySignature.run("signature-selected", "signer-a@hhr.test", "Profesional A", "11.111.111-1", "Medicina", "signatures/a", "image/png", 64, createdAt, createdAt);
    insertLegacySignature.run("signature-newer", "signer-a@hhr.test", "Profesional A", "11.111.111-1", "Medicina", "signatures/b", "image/png", 64, createdAt, updatedAt);
    insertLegacySignature.run("signature-missing-default", "signer-b@hhr.test", "Profesional B", "22.222.222-2", "Medicina", "signatures/c", "image/png", 64, createdAt, updatedAt);
  }

  if (db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'ai_prompts'").get().count) {
    const insertPrompt = db.prepare(`INSERT INTO ai_prompts
      (id, owner_email, name, target_type, instructions, revision, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertPrompt.run("prompt-1", "owner@hhr.test", "Prompt conservado", legacy ? "resumen" : "informe_medico", "Instrucciones conservadas", 3, legacy ? 1 : 0, createdAt, updatedAt);
    if (legacy) {
      insertPrompt.run("prompt-2", "owner@hhr.test", "Prompt más reciente", "informe", "Otras instrucciones", 2, 1, createdAt, updatedAt);
    }
  }
}

function businessSnapshot(db) {
  const snapshot = {};
  const tables = db.prepare(`SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'd1_migrations'
    ORDER BY name`).all();
  for (const { name } of tables) {
    const rows = db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all().map((row) => ({ ...row }));
    if (rows.length) snapshot[name] = rows;
  }
  return snapshot;
}

function expectedUpgradeSnapshot(before) {
  const expected = structuredClone(before);
  for (const row of expected.document_versions ?? []) {
    if (!("snapshot_json" in row)) row.snapshot_json = null;
  }
  for (const row of expected.files ?? []) {
    if (!("mobile_session_id" in row)) row.mobile_session_id = null;
  }
  const migratedPrompts = expected.ai_prompts ?? [];
  for (const row of migratedPrompts) {
    if (["resumen", "informe", "antecedentes"].includes(row.target_type)) {
      row.target_type = "informe_medico";
    }
    if (row.target_type === "informe_medico") row.is_default = 0;
  }
  const promptOwners = new Set(migratedPrompts
    .filter((row) => row.target_type === "informe_medico")
    .map((row) => row.owner_email));
  for (const owner of promptOwners) {
    const newest = migratedPrompts
      .filter((row) => row.owner_email === owner && row.target_type === "informe_medico")
      .sort((left, right) => (
        right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id)
      ))[0];
    newest.is_default = 1;
  }
  const signatureHadDefaultColumn = (expected.signatures ?? []).every((row) => "is_default" in row);
  for (const row of expected.signatures ?? []) {
    if (!("is_default" in row)) row.is_default = 0;
    if (row.owner_email === "signer-b@hhr.test") row.is_default = 1;
    if (!signatureHadDefaultColumn && row.id === "signature-newer") row.is_default = 1;
  }
  return expected;
}

async function createLegacyDatabase(version, path, { requestRepaired = true } = {}) {
  const db = createDatabase(path);
  await applyRepositoryMigration(db, migrationNames[0]);
  const signatureSql = legacySignatureMigration(await readFile(migrationPath(migrationNames[1]), "utf8"));
  applyMigration(db, migrationNames[1], signatureSql);
  if (requestRepaired) emulateLegacyRequestSchema(db);
  for (let index = 2; index <= version; index += 1) {
    await applyRepositoryMigration(db, migrationNames[index]);
  }
  return db;
}

test("a fresh database reaches the canonical schema without request-time DDL", async () => {
  const path = join(temporaryRoot, "fresh.sqlite");
  const db = createDatabase(path);
  try {
    await applyPendingMigrations(db);
    seedData(db, { legacy: false });
    const result = await verifyDatabase(db);
    assert.equal(result.ok, true, JSON.stringify(result.findings));
    assert.deepEqual(
      db.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((row) => row.name),
      migrationNames,
    );
  } finally {
    db.close();
  }

  const runtimeDatabase = await readFile(join(projectRoot, "app/lib/server/database.ts"), "utf8");
  assert.doesNotMatch(runtimeDatabase, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i);
  assert.doesNotMatch(runtimeDatabase, /migrate|PRAGMA/i);
});

for (const version of [1, 2, 3, 4]) {
  test(`upgrades legacy migration 000${version} without losing its records`, async () => {
    const path = join(temporaryRoot, `legacy-${version}.sqlite`);
    const db = await createLegacyDatabase(version, path);
    try {
      seedData(db, { legacy: true });
      const before = businessSnapshot(db);
      await applyPendingMigrations(db);
      assert.deepEqual(businessSnapshot(db), expectedUpgradeSnapshot(before));
      const result = await verifyDatabase(db);
      assert.equal(result.ok, true, JSON.stringify(result.findings));
      const selected = db.prepare("SELECT id FROM signatures WHERE owner_email = ? AND is_default = 1")
        .get("signer-a@hhr.test");
      assert.equal(selected.id, "signature-selected");
    } finally {
      db.close();
    }
  });
}

test("accepts request-time compatibility indexes only while 0005 is pending", async () => {
  const path = join(temporaryRoot, "pending-repaired.sqlite");
  const db = await createLegacyDatabase(4, path);
  try {
    seedData(db, { legacy: true });
    const pending = await verifyDatabase(db, { allowPendingMigrations: true });
    assert.equal(pending.ok, true, JSON.stringify(pending.findings));
    await applyPendingMigrations(db);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'sessions_token_idx'").get().count,
      0,
    );
    const migrated = await verifyDatabase(db);
    assert.equal(migrated.ok, true, JSON.stringify(migrated.findings));
  } finally {
    db.close();
  }
});

for (const version of [1, 2, 3, 4]) {
  test(`prepares and upgrades unrepaired legacy migration 000${version}`, async () => {
    const path = join(temporaryRoot, `unrepaired-${version}.sqlite`);
    const db = await createLegacyDatabase(version, path, { requestRepaired: false });
    try {
      seedData(db, { legacy: true });
      const before = businessSnapshot(db);
      const prepared = prepareLegacySignatureSchema(db);
      assert.equal(prepared.columnAdded, true);
      const pendingResult = await verifyDatabase(db, { allowPendingMigrations: true });
      assert.equal(pendingResult.ok, true, JSON.stringify(pendingResult.findings));

      await applyPendingMigrations(db);
      assert.deepEqual(businessSnapshot(db), expectedUpgradeSnapshot(before));
      const result = await verifyDatabase(db);
      assert.equal(result.ok, true, JSON.stringify(result.findings));
      const selected = db.prepare("SELECT id FROM signatures WHERE owner_email = ? AND is_default = 1")
        .get("signer-a@hhr.test");
      assert.equal(selected.id, "signature-newer");
    } finally {
      db.close();
    }
  });
}

test("the integrity verifier detects schema and relational drift using counts only", async () => {
  const path = join(temporaryRoot, "invalid.sqlite");
  const db = createDatabase(path);
  try {
    await applyPendingMigrations(db);
    seedData(db, { legacy: false });
    db.exec(`
      DROP INDEX files_owner_created_idx;
      CREATE INDEX files_owner_created_idx ON files(owner_email, created_at DESC);
      DROP INDEX signatures_owner_default_idx;
      CREATE UNIQUE INDEX signatures_owner_default_idx
        ON signatures(owner_email) WHERE is_default = 0;
      ALTER TABLE users ADD COLUMN unexpected_note TEXT;
      CREATE TABLE unexpected_table (id TEXT PRIMARY KEY);
      CREATE INDEX unexpected_documents_idx ON documents(title);
      CREATE TRIGGER unexpected_users_trigger AFTER INSERT ON users
        BEGIN SELECT 1; END;
      DELETE FROM documents WHERE id = 'document-1';
      UPDATE signatures SET is_default = 0 WHERE owner_email = 'signer-b@hhr.test';
      DELETE FROM d1_migrations WHERE name = '${migrationNames.at(-1)}';
    `);
    const result = await verifyDatabase(db);
    assert.equal(result.ok, false);
    const checks = new Set(result.findings.map((finding) => finding.check));
    assert.equal(checks.has("schema.index.files_owner_created_idx"), true);
    assert.equal(checks.has("schema.index.signatures_owner_default_idx"), true);
    assert.equal(checks.has("schema.unexpected.column.users.unexpected_note"), true);
    assert.equal(checks.has("schema.unexpected.table.unexpected_table"), true);
    assert.equal(checks.has("schema.unexpected.index.unexpected_documents_idx"), true);
    assert.equal(checks.has("schema.unexpected.trigger.unexpected_users_trigger"), true);
    assert.equal(checks.has("schema.migration_versions"), true);
    assert.equal(checks.has("orphan.document_versions"), true);
    assert.equal(checks.has("orphan.document_files"), true);
    assert.equal(checks.has("signatures.default_count"), true);
  } finally {
    db.close();
  }
});

test("does not treat an empty migration history as a valid pending prefix", async () => {
  const path = join(temporaryRoot, "empty-history.sqlite");
  const db = createDatabase(path);
  try {
    await applyPendingMigrations(db);
    db.exec("DELETE FROM d1_migrations");
    const result = await verifyDatabase(db, { allowPendingMigrations: true });
    assert.equal(result.ok, false);
    assert.equal(
      result.findings.some((finding) => finding.check === "schema.migration_versions"),
      true,
    );
  } finally {
    db.close();
  }
});

test("restores the exact pre-migration database from a disposable backup", async () => {
  const path = join(temporaryRoot, "rollback.sqlite");
  const backupPath = join(temporaryRoot, "rollback-before.sqlite");
  let db = await createLegacyDatabase(4, path);
  seedData(db, { legacy: true });
  const before = businessSnapshot(db);
  const appliedBefore = db.prepare("SELECT name FROM d1_migrations ORDER BY id").all();
  db.close();

  await cp(path, backupPath);
  db = new DatabaseSync(path);
  try {
    await applyPendingMigrations(db);
  } finally {
    db.close();
  }

  await cp(backupPath, path);
  db = new DatabaseSync(path);
  try {
    assert.deepEqual(businessSnapshot(db), before);
    assert.deepEqual(db.prepare("SELECT name FROM d1_migrations ORDER BY id").all(), appliedBefore);
  } finally {
    db.close();
  }
});
