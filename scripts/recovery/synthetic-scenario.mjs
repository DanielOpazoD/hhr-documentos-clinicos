import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDisposableRecoveryWorkspace } from "./recovery.mjs";
import { LocalR2Store } from "./local-r2.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationsRoot = join(projectRoot, "drizzle");
const createdAt = "2026-08-01T12:00:00.000Z";
const updatedAt = "2026-08-01T12:05:00.000Z";

const owners = [
  { id: "a", email: "owner-a@example.invalid", name: "Profesional Sintético A" },
  { id: "b", email: "owner-b@example.invalid", name: "Profesional Sintético B" },
];

function insert(db, sql, rows) {
  const statement = db.prepare(sql);
  for (const row of rows) statement.run(...row);
}

async function applyMigrations(db) {
  const journal = JSON.parse(await readFile(join(migrationsRoot, "meta", "_journal.json"), "utf8"));
  db.exec(`CREATE TABLE d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);
  for (const entry of journal.entries) {
    const name = `${entry.tag}.sql`;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(await readFile(join(migrationsRoot, name), "utf8"));
      db.prepare("INSERT INTO d1_migrations (name, applied_at) VALUES (?, ?)").run(name, createdAt);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function objectFixtures() {
  return owners.flatMap((owner) => [
    {
      id: `file-${owner.id}-desktop`,
      owner: owner.email,
      key: `files/${owner.id}/desktop.pdf`,
      name: `archivo-${owner.id}.pdf`,
      contentType: "application/pdf",
      kind: "file",
      body: Buffer.from(`synthetic-file-${owner.id}-desktop`),
      sessionId: null,
      origin: "Escritorio",
    },
    {
      id: `file-${owner.id}-mobile`,
      owner: owner.email,
      key: `files/${owner.id}/mobile.png`,
      name: `captura-${owner.id}.png`,
      contentType: "image/png",
      kind: "file",
      body: Buffer.from(`synthetic-file-${owner.id}-mobile`),
      sessionId: `session-${owner.id}`,
      origin: "QR móvil",
    },
    {
      id: `signature-${owner.id}`,
      owner: owner.email,
      key: `signatures/${owner.id}.png`,
      name: `Firma sintética ${owner.id.toUpperCase()}`,
      contentType: "image/png",
      kind: "signature",
      body: Buffer.from(`synthetic-signature-${owner.id}`),
    },
    {
      id: `stamp-${owner.id}`,
      owner: owner.email,
      key: `stamps/${owner.id}.png`,
      name: `Timbre sintético ${owner.id.toUpperCase()}`,
      contentType: "image/png",
      kind: "stamp",
      body: Buffer.from(`synthetic-stamp-${owner.id}`),
    },
  ]);
}

function seedDatabase(db, objects) {
  insert(db, `INSERT INTO users (email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?)`, owners.map((owner) => [owner.email, owner.name, createdAt, updatedAt]));
  insert(db, `INSERT INTO patients_demo
    (id, owner_email, name, rut_masked, birth_date, sex, insurance, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, owners.map((owner) => [
    `patient-${owner.id}`, owner.email, `Paciente Sintético ${owner.id.toUpperCase()}`,
    "XX.XXX.XXX-X", "2000-01-01", "X", "Sintético", createdAt, updatedAt,
  ]));
  insert(db, `INSERT INTO document_templates
    (id, name, category, schema_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [
    ["template-a", "Plantilla sintética A", "Ensayo", '{"sections":["summary"]}', createdAt, updatedAt],
    ["template-b", "Plantilla sintética B", "Ensayo", '{"sections":["plan"]}', createdAt, updatedAt],
  ]);
  insert(db, `INSERT INTO ai_prompts
    (id, owner_email, name, target_type, instructions, revision, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, owners.map((owner) => [
    `prompt-${owner.id}`, owner.email, `Prompt sintético ${owner.id.toUpperCase()}`,
    "certificado", "Instrucción completamente sintética", 1, 1, createdAt, updatedAt,
  ]));
  insert(db, `INSERT INTO document_template_settings
    (id, owner_email, template_id, title, sections_json, prompt_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, owners.map((owner) => [
    `setting-${owner.id}`, owner.email, `template-${owner.id}`,
    `Documento sintético ${owner.id.toUpperCase()}`, '[{"id":"summary","title":"Resumen"}]',
    `prompt-${owner.id}`, createdAt, updatedAt,
  ]));
  insert(db, `INSERT INTO documents
    (id, owner_email, template_id, title, patient_name, patient_rut_masked, status,
      content_json, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, owners.map((owner) => [
    `document-${owner.id}`, owner.email, `template-${owner.id}`,
    `Documento sintético ${owner.id.toUpperCase()}`, `Paciente Sintético ${owner.id.toUpperCase()}`,
    "XX.XXX.XXX-X", "Final", `{"sections":[{"id":"summary","body":"Contenido sintético ${owner.id}"}]}`,
    2, createdAt, updatedAt,
  ]));
  insert(db, `INSERT INTO document_versions
    (id, document_id, owner_email, version, content_json, snapshot_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, owners.flatMap((owner) => [1, 2].map((version) => [
    `version-${owner.id}-${version}`, `document-${owner.id}`, owner.email, version,
    `{"sections":[{"id":"summary","body":"Versión sintética ${version}"}]}`,
    `{"templateId":"template-${owner.id}","title":"Documento sintético ${owner.id.toUpperCase()}","patientName":"Paciente Sintético ${owner.id.toUpperCase()}","patientRutMasked":"XX.XXX.XXX-X","status":"Final","content":{"sections":[{"id":"summary","body":"Versión sintética ${version}"}]}}`,
    version === 1 ? createdAt : updatedAt,
  ])));
  insert(db, `INSERT INTO mobile_upload_sessions
    (id, owner_email, token_hash, expires_at, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, owners.map((owner) => [
    `session-${owner.id}`, owner.email, `synthetic-token-hash-${owner.id}`,
    "2026-08-02T12:00:00.000Z", "revocada", createdAt, updatedAt,
  ]));
  const files = objects.filter((object) => object.kind === "file");
  insert(db, `INSERT INTO files
    (id, owner_email, mobile_session_id, object_key, name, mime_type, size, origin,
      status, patient_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, files.map((file) => [
    file.id, file.owner, file.sessionId, file.key, file.name, file.contentType,
    file.body.byteLength, file.origin, "activo", null, createdAt, updatedAt,
  ]));
  insert(db, `INSERT INTO document_files (id, document_id, file_id, created_at)
    VALUES (?, ?, ?, ?)`, files.map((file) => {
    const owner = owners.find((candidate) => candidate.email === file.owner);
    if (!owner) throw new Error("El archivo sintético no tiene propietario conocido.");
    return [`link-${file.id}`, `document-${owner.id}`, file.id, createdAt];
  }));
  const signingAssets = objects.filter((object) => object.kind !== "file");
  insert(db, `INSERT INTO signatures
    (id, owner_email, kind, name, professional_name, professional_rut, specialty,
      object_key, mime_type, size, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, signingAssets.map((asset) => {
    const owner = owners.find((candidate) => candidate.email === asset.owner);
    return [asset.id, asset.owner, asset.kind, asset.name, owner.name, "XX.XXX.XXX-X",
      "Medicina sintética", asset.key, asset.contentType, asset.body.byteLength, 1, createdAt, updatedAt];
  }));
  insert(db, `INSERT INTO ai_usage_events
    (id, owner_email, run_id, provider_id, model, input_tokens, cached_input_tokens,
      output_tokens, total_tokens, estimated_cost_microusd, pricing_source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, owners.map((owner) => [
    `usage-${owner.id}`, owner.email, `run-${owner.id}`, "openai", "synthetic-model",
    10, 0, 5, 15, 0, "synthetic", createdAt,
  ]));
  insert(db, `INSERT INTO ai_operation_runs
    (id, owner_email, operation, provider_id, status, created_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, owners.map((owner) => [
    `operation-${owner.id}`, owner.email, "clinical_draft", "openai", "completed", createdAt, updatedAt,
  ]));
  insert(db, `INSERT INTO audit_events
    (id, owner_email, action, entity_type, entity_id, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, owners.map((owner) => [
    `audit-${owner.id}`, owner.email, "created", "document", `document-${owner.id}`,
    '{"synthetic":true}', createdAt,
  ]));
}

export async function createSyntheticRecoveryScenario() {
  const workspace = await createDisposableRecoveryWorkspace();
  await mkdir(workspace.liveRoot, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(workspace.databasePath);
  const objects = objectFixtures();
  try {
    await applyMigrations(db);
    db.exec("BEGIN IMMEDIATE");
    try {
      seedDatabase(db, objects);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }
  const r2 = new LocalR2Store(workspace.r2Root);
  for (const object of objects) {
    await r2.put(object.key, object.body, { owner: object.owner, contentType: object.contentType });
  }
  return {
    workspace,
    owners,
    objects,
    privateMarkers: [
      ...owners.flatMap((owner) => [owner.email, owner.name]),
      ...objects.flatMap((object) => [object.key, object.name, object.body.toString("utf8")]),
      "Paciente Sintético",
      "Contenido sintético",
      "Instrucción completamente sintética",
    ],
  };
}
