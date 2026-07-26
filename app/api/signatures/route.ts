import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { appEnv } from "@/app/lib/server/environment";
import { jsonError } from "@/app/lib/server/http";
import { safeFileName } from "@/app/lib/server/security";

const MAX_SIGNATURE_SIZE = 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg"]);

export async function GET(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const db = await ensureDatabase();
  await db.prepare(`UPDATE signatures SET is_default = 1 WHERE id = (SELECT id FROM signatures WHERE owner_email = ? ORDER BY updated_at DESC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM signatures WHERE owner_email = ? AND is_default = 1)`).bind(owner, owner).run();
  const result = await db.prepare(`SELECT id, professional_name AS professionalName, professional_rut AS professionalRut, specialty, mime_type AS mimeType, size, is_default AS isDefault, created_at AS createdAt FROM signatures WHERE owner_email = ? ORDER BY is_default DESC, updated_at DESC`).bind(owner).all();
  return Response.json({ signatures: result.results.map((item: { id: string; isDefault?: number }) => ({ ...item, isDefault: Boolean(item.isDefault), imageUrl: `/api/signatures/${item.id}` })) });
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
  await db.prepare(`INSERT INTO signatures (id, owner_email, professional_name, professional_rut, specialty, object_key, mime_type, size, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`).bind(id, owner, professionalName, professionalRut, specialty, objectKey, file.type, file.size, now, now).run();
  await db.prepare(`UPDATE signatures SET is_default = 1 WHERE id = ? AND NOT EXISTS (SELECT 1 FROM signatures WHERE owner_email = ? AND is_default = 1)`).bind(id, owner).run();
  const saved = await db.prepare(`SELECT is_default AS isDefault FROM signatures WHERE id = ? AND owner_email = ?`).bind(id, owner).first<{ isDefault: number }>();
  const isDefault = Boolean(saved?.isDefault);
  await audit(owner, "created", "signature", id, { professionalName });
  return Response.json({ signature: { id, professionalName, professionalRut, specialty, mimeType: file.type, size: file.size, isDefault, imageUrl: `/api/signatures/${id}` } }, { status: 201 });
}
