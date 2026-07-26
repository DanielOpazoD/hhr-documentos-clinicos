import { appEnv } from "./environment";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, display_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS patients_demo (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, name TEXT NOT NULL, rut_masked TEXT NOT NULL, birth_date TEXT, sex TEXT, insurance TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS document_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, schema_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, template_id TEXT NOT NULL, title TEXT NOT NULL, patient_name TEXT NOT NULL, patient_rut_masked TEXT NOT NULL, status TEXT NOT NULL, content_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS document_versions (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, owner_email TEXT NOT NULL, version INTEGER NOT NULL, content_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, object_key TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, origin TEXT NOT NULL, status TEXT NOT NULL, patient_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS document_files (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, file_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS signatures (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, professional_name TEXT NOT NULL, professional_rut TEXT NOT NULL, specialty TEXT NOT NULL, object_key TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS mobile_upload_sessions (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ai_import_runs (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, source_name TEXT NOT NULL, target_type TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ai_prompts (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, name TEXT NOT NULL, target_type TEXT NOT NULL, instructions TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS documents_owner_updated_idx ON documents(owner_email, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS files_owner_created_idx ON files(owner_email, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS signatures_owner_updated_idx ON signatures(owner_email, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS ai_prompts_owner_target_idx ON ai_prompts(owner_email, target_type, updated_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ai_prompts_owner_target_default_idx ON ai_prompts(owner_email, target_type) WHERE is_default = 1`,
  `CREATE INDEX IF NOT EXISTS sessions_token_idx ON mobile_upload_sessions(token_hash)`,
];

let schemaReady: Promise<void> | null = null;

async function ensureSignatureProfileColumns(db: D1Database) {
  const columns = await db.prepare("PRAGMA table_info(signatures)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "is_default")) {
    try {
      await db.prepare("ALTER TABLE signatures ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0").run();
    } catch (error) {
      if (!(error instanceof Error && /duplicate column/i.test(error.message))) throw error;
    }
  }
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS signatures_owner_default_idx ON signatures(owner_email) WHERE is_default = 1").run();
}

export async function ensureDatabase(): Promise<D1Database> {
  const db = appEnv().DB;
  if (!db) throw new Error("La base de datos no está disponible.");
  schemaReady ??= db.batch(schemaStatements.map((statement) => db.prepare(statement)))
    .then(() => ensureSignatureProfileColumns(db))
    .catch((error) => {
      schemaReady = null;
      throw error;
    });
  await schemaReady;
  return db;
}
