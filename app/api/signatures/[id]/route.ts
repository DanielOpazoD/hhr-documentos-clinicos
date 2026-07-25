import { appEnv, audit, ensureDatabase, jsonError, requestOwner } from "@/app/lib/server";

type SignatureRow = { objectKey: string; mimeType: string };

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
  const row = await db.prepare(`SELECT object_key AS objectKey, mime_type AS mimeType FROM signatures WHERE id = ? AND owner_email = ?`).bind(id, owner).first<SignatureRow>();
  if (!row) return jsonError("Firma no encontrada.", 404);
  await appEnv().FILES.delete(row.objectKey);
  await db.prepare(`DELETE FROM signatures WHERE id = ? AND owner_email = ?`).bind(id, owner).run();
  await audit(owner, "deleted", "signature", id);
  return Response.json({ ok: true });
}
