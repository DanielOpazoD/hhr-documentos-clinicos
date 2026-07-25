import { appEnv, audit, ensureDatabase, jsonError, requestOwner, safeFileName } from "@/app/lib/server";

const MAX_SIGNATURE_SIZE = 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg"]);

export async function GET(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const db = await ensureDatabase();
  const result = await db.prepare(`SELECT id, professional_name AS professionalName, professional_rut AS professionalRut, specialty, mime_type AS mimeType, size, created_at AS createdAt FROM signatures WHERE owner_email = ? ORDER BY updated_at DESC`).bind(owner).all();
  return Response.json({ signatures: result.results.map(item => ({ ...item, imageUrl: `/api/signatures/${item.id}` })) });
}

export async function POST(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const form = await request.formData();
  const file = form.get("file");
  const professionalName = String(form.get("professionalName") ?? "").trim();
  const professionalRut = String(form.get("professionalRut") ?? "").trim();
  const specialty = String(form.get("specialty") ?? "").trim();
  if (!(file instanceof File)) return jsonError("Seleccione una imagen de firma.");
  if (!ALLOWED_TYPES.has(file.type)) return jsonError("La firma debe ser PNG o JPG.");
  if (file.size > MAX_SIGNATURE_SIZE) return jsonError("La firma no puede superar 1 MB.");
  if (!professionalName) return jsonError("Ingrese el nombre del profesional.");

  const db = await ensureDatabase();
  const id = crypto.randomUUID();
  const objectKey = `signatures/${id}-${safeFileName(file.name)}`;
  const now = new Date().toISOString();
  await appEnv().FILES.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { owner } });
  await db.prepare(`INSERT INTO signatures (id, owner_email, professional_name, professional_rut, specialty, object_key, mime_type, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, owner, professionalName, professionalRut, specialty, objectKey, file.type, file.size, now, now).run();
  await audit(owner, "created", "signature", id, { professionalName });
  return Response.json({ signature: { id, professionalName, professionalRut, specialty, mimeType: file.type, size: file.size, imageUrl: `/api/signatures/${id}` } }, { status: 201 });
}
