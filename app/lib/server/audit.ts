import { ensureDatabase } from "./database";

export async function audit(
  owner: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  const db = await ensureDatabase();
  await db.prepare(
    "INSERT INTO audit_events (id, owner_email, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    crypto.randomUUID(),
    owner,
    action,
    entityType,
    entityId,
    JSON.stringify(metadata),
    new Date().toISOString(),
  ).run();
}
