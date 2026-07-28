import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { appEnv } from "@/app/lib/server/environment";
import { jsonError } from "@/app/lib/server/http";
import { deleteOwnedFiles } from "@/app/features/files/server/delete-files";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const { id } = await context.params;
  const db = await ensureDatabase();
  const row = await db.prepare(`SELECT object_key AS objectKey, name, mime_type AS mimeType FROM files WHERE id = ? AND owner_email = ? AND status IN ('activo', 'archivado')`).bind(id, owner).first<{ objectKey: string; name: string; mimeType: string }>();
  if (!row) return jsonError("Archivo no encontrado.", 404);
  const object = await appEnv().FILES.get(row.objectKey);
  if (!object) return jsonError("Contenido no disponible.", 404);
  await audit(owner, "downloaded", "file", id);
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? `attachment; filename="${row.name.replace(/\"/g, "")}"` : `inline; filename="${row.name.replace(/\"/g, "")}"`;
  return new Response(object.body, { headers: { "Content-Type": row.mimeType, "Content-Disposition": disposition, "Cache-Control": "private, max-age=60" } });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const { id } = await context.params;
  const deletedIds = await deleteOwnedFiles(owner, [id]);
  if (!deletedIds.length) return jsonError("Archivo no encontrado.", 404);
  return Response.json({ ok: true, deletedIds });
}
