import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { appEnv } from "@/app/lib/server/environment";
import { jsonError, observeApi } from "@/app/lib/server/http";
import { safeFileName } from "@/app/lib/server/security";

const MAX_SIGNATURE_SIZE = 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg"]);
const ASSET_KINDS = new Set(["signature", "stamp"]);
type SignatureListRow = {
  id: string;
  kind: string;
  name: string;
  professionalName: string;
  professionalRut: string;
  specialty: string;
  mimeType: string;
  size: number;
  isDefault: number;
  createdAt: string;
};

async function getSignatures(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const db = await ensureDatabase();
  await db.batch(["signature", "stamp"].map((kind) => db.prepare(`UPDATE signatures
    SET is_default = 1
    WHERE id = (SELECT id FROM signatures WHERE owner_email = ? AND kind = ? ORDER BY updated_at DESC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM signatures WHERE owner_email = ? AND kind = ? AND is_default = 1)`)
    .bind(owner, kind, owner, kind)));
  const result = await db.prepare(`SELECT id, kind, name, professional_name AS professionalName, professional_rut AS professionalRut, specialty, mime_type AS mimeType, size, is_default AS isDefault, created_at AS createdAt FROM signatures WHERE owner_email = ? ORDER BY kind, is_default DESC, updated_at DESC`).bind(owner).all<SignatureListRow>();
  return Response.json({ signatures: result.results.map((item) => ({
    ...item,
    name: item.name || `${item.kind === "stamp" ? "Timbre" : "Firma"} de ${item.professionalName}`,
    isDefault: Boolean(item.isDefault),
    imageUrl: `/api/signatures/${item.id}`,
  })) });
}

async function createSignature(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const form = await request.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "signature");
  const name = String(form.get("name") ?? "").trim();
  const professionalName = String(form.get("professionalName") ?? "").trim();
  const professionalRut = String(form.get("professionalRut") ?? "").trim();
  const specialty = String(form.get("specialty") ?? "").trim();
  if (!ASSET_KINDS.has(kind)) return jsonError("Tipo de imagen no válido.");
  const label = kind === "stamp" ? "timbre" : "firma";
  if (!(file instanceof File)) return jsonError(`Seleccione una imagen de ${label}.`);
  if (!ALLOWED_TYPES.has(file.type)) return jsonError(`El ${label} debe ser PNG o JPG.`);
  if (file.size > MAX_SIGNATURE_SIZE) return jsonError(`El ${label} no puede superar 1 MB.`);
  if (!professionalName) return jsonError("Ingrese el nombre del profesional.");
  if (name.length > 80) return jsonError("El nombre de la imagen no puede superar 80 caracteres.");

  const db = await ensureDatabase();
  const id = crypto.randomUUID();
  const objectKey = `${kind === "stamp" ? "stamps" : "signatures"}/${id}-${safeFileName(file.name)}`;
  const now = new Date().toISOString();
  await appEnv().FILES.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { owner } });
  const displayName = name || `${kind === "stamp" ? "Timbre" : "Firma"} de ${professionalName}`;
  await db.prepare(`INSERT INTO signatures (id, owner_email, kind, name, professional_name, professional_rut, specialty, object_key, mime_type, size, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`).bind(id, owner, kind, displayName, professionalName, professionalRut, specialty, objectKey, file.type, file.size, now, now).run();
  await db.prepare(`UPDATE signatures SET is_default = 1 WHERE id = ? AND NOT EXISTS (SELECT 1 FROM signatures WHERE owner_email = ? AND kind = ? AND is_default = 1)`).bind(id, owner, kind).run();
  const saved = await db.prepare(`SELECT is_default AS isDefault FROM signatures WHERE id = ? AND owner_email = ?`).bind(id, owner).first<{ isDefault: number }>();
  const isDefault = Boolean(saved?.isDefault);
  await audit(owner, "created", kind, id, { professionalName });
  return Response.json({ signature: { id, kind, name: displayName, professionalName, professionalRut, specialty, mimeType: file.type, size: file.size, isDefault, imageUrl: `/api/signatures/${id}` } }, { status: 201 });
}

export const GET = observeApi("signatures.GET", getSignatures);
export const POST = observeApi("signatures.POST", createSignature);
