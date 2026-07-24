import { appEnv, audit, ensureDatabase, jsonError, requestOwner, safeFileName } from "@/app/lib/server";

const allowed = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/heic", "image/heif"]);
const maxBytes = 15 * 1024 * 1024;

export async function GET(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const db = await ensureDatabase();
  const result = await db.prepare(`SELECT id, name, mime_type AS mimeType, size, origin, status, patient_id AS patientId, created_at AS createdAt FROM files WHERE owner_email = ? AND status != 'eliminado' ORDER BY created_at DESC LIMIT 100`).bind(owner).all();
  return Response.json({ files: result.results });
}

export async function POST(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Selecciona un archivo válido.");
  if (!allowed.has(file.type) || file.size > maxBytes) return jsonError("Tipo no permitido o archivo superior a 15 MB.");
  const name = safeFileName(file.name);
  const id = crypto.randomUUID();
  const objectKey = `${owner}/${id}/${name}`;
  await appEnv().FILES.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { owner } });
  const now = new Date().toISOString();
  const origin = safeFileName(String(form.get("origin") ?? "Escritorio"));
  const db = await ensureDatabase();
  await db.prepare(`INSERT INTO files (id, owner_email, object_key, name, mime_type, size, origin, status, patient_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'activo', ?, ?, ?)`).bind(id, owner, objectKey, name, file.type, file.size, origin, String(form.get("patientId") ?? "") || null, now, now).run();
  await audit(owner, "uploaded", "file", id, { mimeType: file.type, size: file.size, origin });
  return Response.json({ file: { id, name, mimeType: file.type, size: file.size, origin, status: "activo", createdAt: now } }, { status: 201 });
}

export async function PATCH(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const payload = await request.json() as { id?: string; name?: string; status?: string };
  if (!payload.id) return jsonError("Archivo no identificado.");
  const db = await ensureDatabase();
  const current = await db.prepare(`SELECT name, status FROM files WHERE id = ? AND owner_email = ?`).bind(payload.id, owner).first<{ name: string; status: string }>();
  if (!current) return jsonError("Archivo no encontrado.", 404);
  const name = payload.name ? safeFileName(payload.name) : current.name;
  const status = payload.status === "archivado" || payload.status === "activo" ? payload.status : current.status;
  await db.prepare(`UPDATE files SET name = ?, status = ?, updated_at = ? WHERE id = ? AND owner_email = ?`).bind(name, status, new Date().toISOString(), payload.id, owner).run();
  await audit(owner, status === "archivado" ? "archived" : "renamed", "file", payload.id, { name, status });
  return Response.json({ file: { id: payload.id, name, status } });
}
