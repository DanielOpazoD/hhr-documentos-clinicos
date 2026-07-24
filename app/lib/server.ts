import { env } from "cloudflare:workers";

type AppEnv = {
  DB: D1Database;
  FILES: R2Bucket;
};

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, display_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS patients_demo (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, name TEXT NOT NULL, rut_masked TEXT NOT NULL, birth_date TEXT, sex TEXT, insurance TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS document_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, schema_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, template_id TEXT NOT NULL, title TEXT NOT NULL, patient_name TEXT NOT NULL, patient_rut_masked TEXT NOT NULL, status TEXT NOT NULL, content_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS document_versions (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, owner_email TEXT NOT NULL, version INTEGER NOT NULL, content_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, object_key TEXT NOT NULL, name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, origin TEXT NOT NULL, status TEXT NOT NULL, patient_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS document_files (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, file_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS mobile_upload_sessions (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ai_import_runs (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, source_name TEXT NOT NULL, target_type TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS documents_owner_updated_idx ON documents(owner_email, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS files_owner_created_idx ON files(owner_email, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS sessions_token_idx ON mobile_upload_sessions(token_hash)`,
];

let schemaReady: Promise<void> | null = null;

export function appEnv(): AppEnv {
  return env as unknown as AppEnv;
}

export async function ensureDatabase(): Promise<D1Database> {
  const db = appEnv().DB;
  if (!db) throw new Error("La base de datos no está disponible.");
  schemaReady ??= db.batch(schemaStatements.map(statement => db.prepare(statement))).then(() => undefined);
  await schemaReady;
  return db;
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export function requestOwner(request: Request): string | null {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (email) return email;
  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") return "preview@hhr.local";
  return null;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function safeFileName(name: string): string {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._ -]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "archivo";
}

export async function audit(owner: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  const db = await ensureDatabase();
  await db.prepare(`INSERT INTO audit_events (id, owner_email, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), owner, action, entityType, entityId, JSON.stringify(metadata), new Date().toISOString()).run();
}
