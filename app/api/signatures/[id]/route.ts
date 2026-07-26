import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { appEnv } from "@/app/lib/server/environment";
import { jsonError } from "@/app/lib/server/http";

type SignatureRow = { objectKey: string; mimeType: string; isDefault?: number };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const { id } = await context.params;
  const db = await ensureDatabase();
  const row = await db.prepare(`SELECT object_key AS objectKey, mime_type AS mimeType FROM signatures WHERE id = ? AND owner_email = ?`).bind(id, owner).first<SignatureRow>();
  if (!row) return jsonError("Firma no encontrada.", 404);
  const object = await appEnv().FILES.get(row.objectKey);
  if (!object) return jsonError("Imagen no encontrada.", 404);
  return new Response(object.body, { headers: { "Content-Type": row.mimeType, "Cache-Control": "private, max-age=300" } });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const { id } = await context.params;
  const db = await ensureDatabase();
  const row = await db.prepare(`SELECT object_key AS objectKey, mime_type AS mimeType, is_default AS isDefault FROM signatures WHERE id = ? AND owner_email = ?`).bind(id, owner).first<SignatureRow>();
  if (!row) return jsonError("Firma no encontrada.", 404);
  await appEnv().FILES.delete(row.objectKey);
  await db.prepare(`DELETE FROM signatures WHERE id = ? AND owner_email = ?`).bind(id, owner).run();
  if (row.isDefault) {
    const replacement = await db.prepare(`SELECT id FROM signatures WHERE owner_email = ? ORDER BY updated_at DESC LIMIT 1`).bind(owner).first<{ id: string }>();
    if (replacement) {
      await db.prepare(`UPDATE signatures SET is_default = 1 WHERE id = ? AND owner_email = ?`).bind(replacement.id, owner).run();
    }
  }
  await audit(owner, "deleted", "signature", id);
  return Response.json({ ok: true });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { isDefault?: boolean } | null;
  if (body?.isDefault !== true) return jsonError("Solicitud de perfil no válida.");

  const db = await ensureDatabase();
  const profile = await db.prepare(`SELECT id FROM signatures WHERE id = ? AND owner_email = ?`).bind(id, owner).first<{ id: string }>();
  if (!profile) return jsonError("Perfil no encontrado.", 404);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE signatures SET is_default = 0 WHERE owner_email = ?`).bind(owner),
    db.prepare(`UPDATE signatures SET is_default = 1, updated_at = ? WHERE id = ? AND owner_email = ?`).bind(now, id, owner),
  ]);
  await audit(owner, "defaulted", "signature", id);
  return Response.json({ ok: true });
}
