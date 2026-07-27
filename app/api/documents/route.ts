import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { jsonError, readJsonObject } from "@/app/lib/server/http";
import {
  nextDocumentVersion,
  normalizeDocumentStatus,
  requiresPatientIdentity,
} from "@/app/features/documents/document-policy";

// D1 admite hasta 100 parámetros enlazados; la consulta también enlaza al propietario.
const MAX_DOCUMENTS_PER_REQUEST = 99;

export async function GET(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const db = await ensureDatabase();
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const document = await db.prepare(`SELECT id, template_id AS templateId, title, patient_name AS patientName, patient_rut_masked AS patientRutMasked, status, content_json AS contentJson, version, updated_at AS updatedAt FROM documents WHERE id = ? AND owner_email = ?`).bind(id, owner).first<Record<string, unknown>>();
    if (!document) return jsonError("Documento no encontrado.", 404);
    const { contentJson, ...metadata } = document;
    let content: unknown = {};
    try { content = JSON.parse(String(contentJson ?? "{}")); } catch { content = {}; }
    return Response.json({ document: { ...metadata, content } });
  }
  const result = await db.prepare(`SELECT id, template_id AS templateId, title, patient_name AS patientName, patient_rut_masked AS patientRutMasked, status, version, updated_at AS updatedAt FROM documents WHERE owner_email = ? ORDER BY updated_at DESC LIMIT ${MAX_DOCUMENTS_PER_REQUEST}`).bind(owner).all();
  return Response.json({ documents: result.results });
}

export async function POST(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const payload = await readJsonObject(request);
  if (!payload) return jsonError("Solicitud JSON inválida.");
  const title = String(payload.title ?? "").trim();
  const patientName = String(payload.patientName ?? "").trim();
  const templateId = String(payload.templateId ?? "documento_libre");
  const status = normalizeDocumentStatus(payload.status);
  if (!title) return jsonError("El título es obligatorio.");
  if (requiresPatientIdentity(status) && !patientName) {
    return jsonError("Identifique al paciente antes de revisar o finalizar.");
  }

  const db = await ensureDatabase();
  const id = String(payload.id ?? crypto.randomUUID());
  const now = new Date().toISOString();
  const existing = await db.prepare(`SELECT version, status FROM documents WHERE id = ? AND owner_email = ?`).bind(id, owner).first<{ version: number; status: string }>();
  const version = nextDocumentVersion(existing, status);
  const createsVersion = Boolean(existing && version > existing.version);
  const contentJson = JSON.stringify(payload.content ?? {});

  if (existing) {
    const update = db.prepare(`UPDATE documents SET template_id = ?, title = ?, patient_name = ?, patient_rut_masked = ?, status = ?, content_json = ?, version = ?, updated_at = ? WHERE id = ? AND owner_email = ?`).bind(templateId, title, patientName, String(payload.patientRutMasked ?? ""), status, contentJson, version, now, id, owner);
    if (createsVersion) await db.batch([update, db.prepare(`INSERT INTO document_versions (id, document_id, owner_email, version, content_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), id, owner, version, contentJson, now)]);
    else await update.run();
  } else {
    await db.batch([
      db.prepare(`INSERT INTO documents (id, owner_email, template_id, title, patient_name, patient_rut_masked, status, content_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, owner, templateId, title, patientName, String(payload.patientRutMasked ?? ""), status, contentJson, version, now, now),
      db.prepare(`INSERT INTO document_versions (id, document_id, owner_email, version, content_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), id, owner, version, contentJson, now),
    ]);
  }
  await audit(owner, existing ? "updated" : "created", "document", id, { status, version });
  return Response.json({ document: { id, title, patientName, templateId, status, version, updatedAt: now } }, { status: existing ? 200 : 201 });
}

export async function DELETE(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const queryId = new URL(request.url).searchParams.get("id")?.trim();
  const payload = queryId ? null : await readJsonObject(request);
  const requestedIds = queryId
    ? [queryId]
    : Array.isArray(payload?.ids) ? payload.ids.map((id) => String(id).trim()).filter(Boolean) : [];
  const ids = [...new Set(requestedIds)];
  if (!ids.length) return jsonError("Documento no especificado.");
  if (ids.length > MAX_DOCUMENTS_PER_REQUEST) return jsonError(`Puede eliminar hasta ${MAX_DOCUMENTS_PER_REQUEST} documentos por operación.`);
  const db = await ensureDatabase();
  const placeholders = ids.map(() => "?").join(",");
  const owned = await db.prepare(`SELECT id FROM documents WHERE owner_email = ? AND id IN (${placeholders})`).bind(owner, ...ids).all<{ id: string }>();
  const ownedIds = owned.results.map((document) => document.id);
  if (ownedIds.length !== ids.length) return jsonError("Uno o más documentos no están disponibles.", 404);
  const deletedAt = new Date().toISOString();
  const ownedPlaceholders = ownedIds.map(() => "?").join(",");
  await db.batch([
    db.prepare(`DELETE FROM document_files WHERE document_id IN (${ownedPlaceholders})`).bind(...ownedIds),
    db.prepare(`DELETE FROM document_versions WHERE owner_email = ? AND document_id IN (${ownedPlaceholders})`).bind(owner, ...ownedIds),
    db.prepare(`DELETE FROM documents WHERE owner_email = ? AND id IN (${ownedPlaceholders})`).bind(owner, ...ownedIds),
    db.prepare("INSERT INTO audit_events (id, owner_email, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(
      crypto.randomUUID(),
      owner,
      "deleted",
      ownedIds.length > 1 ? "documents" : "document",
      ownedIds.length > 1 ? `bulk:${crypto.randomUUID()}` : ownedIds[0],
      JSON.stringify({ bulk: ownedIds.length > 1, ids: ownedIds }),
      deletedAt,
    ),
  ]);
  return Response.json({ ok: true, deletedIds: ownedIds });
}
