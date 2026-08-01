import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { appEnv } from "@/app/lib/server/environment";
import { jsonError, observeApi } from "@/app/lib/server/http";

type SignatureRow = { objectKey: string; mimeType: string; isDefault?: number; kind: string };

async function getSignature(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const { id } = await context.params;
  const db = await ensureDatabase();
  const row = await db.prepare(`SELECT object_key AS objectKey, mime_type AS mimeType, kind FROM signatures WHERE id = ? AND owner_email = ?`).bind(id, owner).first<SignatureRow>();
  if (!row) return jsonError("Imagen no encontrada.", 404);
  const object = await appEnv().FILES.get(row.objectKey);
  if (!object) return jsonError("Imagen no encontrada.", 404);
  return new Response(object.body, { headers: { "Content-Type": row.mimeType, "Cache-Control": "private, max-age=300" } });
}

async function deleteSignature(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const { id } = await context.params;
  const db = await ensureDatabase();
  const row = await db.prepare(`SELECT object_key AS objectKey, mime_type AS mimeType, is_default AS isDefault, kind FROM signatures WHERE id = ? AND owner_email = ?`).bind(id, owner).first<SignatureRow>();
  if (!row) return jsonError("Imagen no encontrada.", 404);
  await appEnv().FILES.delete(row.objectKey);
  await db.prepare(`DELETE FROM signatures WHERE id = ? AND owner_email = ?`).bind(id, owner).run();
  if (row.isDefault) {
    const replacement = await db.prepare(`SELECT id FROM signatures WHERE owner_email = ? AND kind = ? ORDER BY updated_at DESC LIMIT 1`).bind(owner, row.kind).first<{ id: string }>();
    if (replacement) {
      await db.prepare(`UPDATE signatures SET is_default = 1 WHERE id = ? AND owner_email = ?`).bind(replacement.id, owner).run();
    }
  }
  await audit(owner, "deleted", row.kind, id);
  return Response.json({ ok: true });
}

async function updateSignature(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { isDefault?: boolean } | null;
  if (body?.isDefault !== true) return jsonError("Solicitud de perfil no válida.");

  const db = await ensureDatabase();
  const profile = await db.prepare(`SELECT id, kind FROM signatures WHERE id = ? AND owner_email = ?`).bind(id, owner).first<{ id: string; kind: string }>();
  if (!profile) return jsonError("Imagen no encontrada.", 404);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE signatures SET is_default = 0 WHERE owner_email = ? AND kind = ?`).bind(owner, profile.kind),
    db.prepare(`UPDATE signatures SET is_default = 1, updated_at = ? WHERE id = ? AND owner_email = ?`).bind(now, id, owner),
  ]);
  await audit(owner, "defaulted", profile.kind, id);
  return Response.json({ ok: true });
}

export const GET = observeApi("signatures.id.GET", getSignature);
export const DELETE = observeApi("signatures.id.DELETE", deleteSignature);
export const PATCH = observeApi("signatures.id.PATCH", updateSignature);
