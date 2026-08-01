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

export async function auditBestEffort(
  owner: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    await audit(owner, action, entityType, entityId, metadata);
    return true;
  } catch {
    console.error(JSON.stringify({
      level: "error",
      event: "audit_write_failed",
      action,
      entityType,
    }));
    return false;
  }
}
