import { appEnv, audit, ensureDatabase, jsonError, safeFileName, sha256 } from "@/app/lib/server";

async function resolveSession(token: string) {
  const db = await ensureDatabase();
  const hash = await sha256(token);
  return db.prepare(`SELECT id, owner_email AS ownerEmail, expires_at AS expiresAt, status FROM mobile_upload_sessions WHERE token_hash = ?`).bind(hash).first<{ id: string; ownerEmail: string; expiresAt: string; status: string }>();
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const session = await resolveSession(token);
  if (!session || session.status !== "activa" || Date.parse(session.expiresAt) <= Date.now()) return jsonError("Este enlace expiró o fue revocado.", 410);
  return Response.json({ session: { id: session.id, expiresAt: session.expiresAt } });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const session = await resolveSession(token);
  if (!session || session.status !== "activa" || Date.parse(session.expiresAt) <= Date.now()) return jsonError("Este enlace expiró o fue revocado.", 410);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size > 15 * 1024 * 1024 || !["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"].includes(file.type)) return jsonError("Archivo no permitido o superior a 15 MB.");
  const id = crypto.randomUUID();
  const name = safeFileName(file.name);
  const objectKey = `${session.ownerEmail}/${id}/${name}`;
  await appEnv().FILES.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { owner: session.ownerEmail, sessionId: session.id } });
  const now = new Date().toISOString();
  const db = await ensureDatabase();
  await db.prepare(`INSERT INTO files (id, owner_email, object_key, name, mime_type, size, origin, status, patient_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'QR móvil', 'activo', NULL, ?, ?)`).bind(id, session.ownerEmail, objectKey, name, file.type, file.size, now, now).run();
  await audit(session.ownerEmail, "uploaded", "file", id, { origin: "QR móvil", sessionId: session.id, size: file.size });
  return Response.json({ file: { id, name, mimeType: file.type, size: file.size, origin: "QR móvil", createdAt: now } }, { status: 201 });
}
