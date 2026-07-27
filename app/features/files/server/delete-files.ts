import { audit } from "@/app/lib/server/audit";
import { ensureDatabase } from "@/app/lib/server/database";
import { appEnv } from "@/app/lib/server/environment";

type StoredFileObject = { id: string; objectKey: string; name: string };

async function cleanupFileObjects(files: StoredFileObject[]): Promise<void> {
  if (!files.length) return;
  const results = await Promise.allSettled(files.map((file) => appEnv().FILES.delete(file.objectKey)));
  const cleanedIds = files.filter((_, index) => results[index].status === "fulfilled").map((file) => file.id);
  if (!cleanedIds.length) return;
  const db = await ensureDatabase();
  const placeholders = cleanedIds.map(() => "?").join(",");
  await db.prepare(`DELETE FROM files WHERE status = 'eliminado' AND id IN (${placeholders})`).bind(...cleanedIds).run();
}

export async function cleanupPendingFileDeletes(owner: string): Promise<void> {
  const db = await ensureDatabase();
  const result = await db.prepare(
    "SELECT id, object_key AS objectKey, name FROM files WHERE owner_email = ? AND status = 'eliminado' LIMIT 20",
  ).bind(owner).all<StoredFileObject>();
  await cleanupFileObjects(result.results);
}

export async function deleteOwnedFiles(owner: string, requestedIds: string[]): Promise<string[]> {
  const ids = [...new Set(requestedIds.map((id) => id.trim()).filter(Boolean))].slice(0, 100);
  if (!ids.length) return [];

  const db = await ensureDatabase();
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.prepare(
    `SELECT id, object_key AS objectKey, name FROM files WHERE owner_email = ? AND status != 'eliminado' AND id IN (${placeholders})`,
  ).bind(owner, ...ids).all<StoredFileObject>();
  const ownedFiles = result.results;
  if (!ownedFiles.length) return [];

  const ownedIds = ownedFiles.map((file) => file.id);
  const ownedPlaceholders = ownedIds.map(() => "?").join(",");
  await db.prepare(
    `UPDATE files SET status = 'eliminado', updated_at = ? WHERE owner_email = ? AND id IN (${ownedPlaceholders})`,
  ).bind(new Date().toISOString(), owner, ...ownedIds).run();
  await Promise.all(ownedFiles.map((file) => audit(owner, "deleted", "file", file.id, { name: file.name }))).catch(() => undefined);
  await cleanupFileObjects(ownedFiles).catch(() => undefined);
  return ownedIds;
}
