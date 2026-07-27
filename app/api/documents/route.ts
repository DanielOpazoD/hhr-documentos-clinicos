import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { jsonError, readJsonObject } from "@/app/lib/server/http";
import {
  isDocumentWriteConflict,
  nextDocumentVersion,
  normalizeDocumentStatus,
  requiresPatientIdentity,
} from "@/app/features/documents/document-policy";
import { serializeDocumentVersionSnapshot } from "@/app/features/documents/document-version";

// D1 admite hasta 100 parámetros enlazados; la consulta también enlaza al propietario.
const MAX_DOCUMENTS_PER_REQUEST = 99;

type ExistingDocument = { version: number; status: string; updatedAt: string };

function changedRows(result: D1Result): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

function conflictError() {
  return jsonError("Este documento cambió en otra pestaña. Vuelva a abrirlo antes de guardar.", 409);
}

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
  const expectedUpdatedAt = typeof payload.expectedUpdatedAt === "string" && payload.expectedUpdatedAt
    ? payload.expectedUpdatedAt
    : undefined;
  if (!title) return jsonError("El título es obligatorio.");
  if (requiresPatientIdentity(status) && !patientName) {
    return jsonError("Identifique al paciente antes de revisar o finalizar.");
  }

  const db = await ensureDatabase();
  const id = String(payload.id ?? crypto.randomUUID());
  const now = new Date().toISOString();
  const existing = await db.prepare(`SELECT version, status, updated_at AS updatedAt FROM documents WHERE id = ? AND owner_email = ?`).bind(id, owner).first<ExistingDocument>();
  if (existing && !expectedUpdatedAt) return conflictError();
  if (existing && isDocumentWriteConflict(existing.updatedAt, expectedUpdatedAt)) return conflictError();
  const version = nextDocumentVersion(existing, status);
  const createsVersion = Boolean(existing && version > existing.version);
  const contentJson = JSON.stringify(payload.content ?? {});
  const patientRutMasked = String(payload.patientRutMasked ?? "");
  const snapshotJson = serializeDocumentVersionSnapshot({
    templateId,
    title,
    patientName,
    patientRutMasked,
    status,
    content: payload.content ?? {},
  });

  if (existing) {
    const update = db.prepare(`UPDATE documents SET template_id = ?, title = ?, patient_name = ?, patient_rut_masked = ?, status = ?, content_json = ?, version = ?, updated_at = ? WHERE id = ? AND owner_email = ? AND updated_at = ?`)
      .bind(templateId, title, patientName, patientRutMasked, status, contentJson, version, now, id, owner, expectedUpdatedAt);
    if (createsVersion) {
      const versionInsert = db.prepare(`INSERT INTO document_versions (id, document_id, owner_email, version, content_json, snapshot_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM documents WHERE id = ? AND owner_email = ? AND updated_at = ?)`)
        .bind(crypto.randomUUID(), id, owner, version, contentJson, snapshotJson, now, id, owner, expectedUpdatedAt);
      const results = await db.batch([versionInsert, update]);
      if (changedRows(results[1]) === 0) return conflictError();
    } else {
      const result = await update.run();
      if (changedRows(result) === 0) return conflictError();
    }
  } else {
    await db.batch([
      db.prepare(`INSERT INTO documents (id, owner_email, template_id, title, patient_name, patient_rut_masked, status, content_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, owner, templateId, title, patientName, patientRutMasked, status, contentJson, version, now, now),
      db.prepare(`INSERT INTO document_versions (id, document_id, owner_email, version, content_json, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), id, owner, version, contentJson, snapshotJson, now),
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
