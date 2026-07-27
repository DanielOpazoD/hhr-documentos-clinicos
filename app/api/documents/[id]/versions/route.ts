import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { jsonError, readJsonObject } from "@/app/lib/server/http";
import { isDocumentWriteConflict, normalizeDocumentStatus } from "@/app/features/documents/document-policy";
import { nextRestorationVersions, parseDocumentVersionSnapshot } from "@/app/features/documents/document-version";

type CurrentDocument = {
  id: string;
  templateId: string;
  title: string;
  patientName: string;
  patientRutMasked: string;
  status: string;
  contentJson: string;
  version: number;
  updatedAt: string;
};

type VersionRow = {
  version: number;
  snapshotJson: string | null;
  createdAt: string;
};

const MAX_DOCUMENT_VERSIONS = 50;
const currentDocumentQuery = `SELECT id, template_id AS templateId, title, patient_name AS patientName, patient_rut_masked AS patientRutMasked, status, content_json AS contentJson, version, updated_at AS updatedAt FROM documents WHERE id = ? AND owner_email = ?`;

function changedRows(result: D1Result): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

function currentSnapshot(current: CurrentDocument) {
  let content: unknown;
  try {
    content = JSON.parse(current.contentJson);
  } catch {
    return null;
  }
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  return {
    templateId: current.templateId,
    title: current.title,
    patientName: current.patientName,
    patientRutMasked: current.patientRutMasked,
    status: normalizeDocumentStatus(current.status),
    content,
  };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const { id } = await context.params;
  const db = await ensureDatabase();
  const current = await db.prepare(currentDocumentQuery).bind(id, owner).first<CurrentDocument>();
  if (!current) return jsonError("Documento no encontrado.", 404);
  const result = await db.prepare(`SELECT version, snapshot_json AS snapshotJson, created_at AS createdAt FROM document_versions WHERE document_id = ? AND owner_email = ? AND snapshot_json IS NOT NULL ORDER BY version DESC LIMIT ${MAX_DOCUMENT_VERSIONS}`)
    .bind(id, owner)
    .all<VersionRow>();
  return Response.json({
    versions: result.results.flatMap((row) => {
      const snapshot = parseDocumentVersionSnapshot(row.snapshotJson);
      if (!snapshot) return [];
      return {
        version: row.version,
        title: snapshot.title,
        patientName: snapshot.patientName,
        status: snapshot.status,
        createdAt: row.createdAt,
      };
    }),
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const payload = await readJsonObject(request);
  if (!payload) return jsonError("Solicitud JSON inválida.");
  const requestedVersion = Number(payload.version);
  const expectedUpdatedAt = typeof payload.expectedUpdatedAt === "string" ? payload.expectedUpdatedAt : "";
  if (!Number.isInteger(requestedVersion) || requestedVersion < 1) return jsonError("Versión no válida.");
  if (!expectedUpdatedAt) return jsonError("Vuelva a abrir el documento antes de restaurar.", 409);

  const { id } = await context.params;
  const db = await ensureDatabase();
  const current = await db.prepare(currentDocumentQuery).bind(id, owner).first<CurrentDocument>();
  if (!current) return jsonError("Documento no encontrado.", 404);
  if (isDocumentWriteConflict(current.updatedAt, expectedUpdatedAt)) {
    return jsonError("Este documento cambió en otra pestaña. Vuelva a abrirlo antes de restaurar.", 409);
  }
  const row = await db.prepare(`SELECT version, snapshot_json AS snapshotJson, created_at AS createdAt FROM document_versions WHERE document_id = ? AND owner_email = ? AND version = ? AND snapshot_json IS NOT NULL`)
    .bind(id, owner, requestedVersion)
    .first<VersionRow>();
  if (!row) return jsonError("Versión no encontrada.", 404);

  const snapshot = parseDocumentVersionSnapshot(row.snapshotJson);
  const tip = currentSnapshot(current);
  if (!snapshot) return jsonError("Esta versión heredada no contiene una instantánea completa y no se puede restaurar.", 409);
  if (!tip) return jsonError("El documento actual no se puede respaldar antes de restaurar.", 409);
  const now = new Date().toISOString();
  const { archivedVersion, restoredVersion } = nextRestorationVersions(current.version);
  const restoredSnapshot = { ...snapshot, status: "Borrador" as const };
  const guard = `WHERE EXISTS (SELECT 1 FROM documents WHERE id = ? AND owner_email = ? AND updated_at = ?)`;
  const archivedInsert = db.prepare(`INSERT INTO document_versions (id, document_id, owner_email, version, content_json, snapshot_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ? ${guard}`)
    .bind(crypto.randomUUID(), id, owner, archivedVersion, current.contentJson, JSON.stringify(tip), now, id, owner, expectedUpdatedAt);
  const restoredContentJson = JSON.stringify(restoredSnapshot.content);
  const restoredInsert = db.prepare(`INSERT INTO document_versions (id, document_id, owner_email, version, content_json, snapshot_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ? ${guard}`)
    .bind(crypto.randomUUID(), id, owner, restoredVersion, restoredContentJson, JSON.stringify(restoredSnapshot), now, id, owner, expectedUpdatedAt);
  const update = db.prepare(`UPDATE documents SET template_id = ?, title = ?, patient_name = ?, patient_rut_masked = ?, status = 'Borrador', content_json = ?, version = ?, updated_at = ? WHERE id = ? AND owner_email = ? AND updated_at = ?`)
    .bind(restoredSnapshot.templateId, restoredSnapshot.title, restoredSnapshot.patientName, restoredSnapshot.patientRutMasked, restoredContentJson, restoredVersion, now, id, owner, expectedUpdatedAt);
  const results = await db.batch([archivedInsert, restoredInsert, update]);
  if (changedRows(results[2]) === 0) {
    return jsonError("Este documento cambió en otra pestaña. Vuelva a abrirlo antes de restaurar.", 409);
  }
  await audit(owner, "restored", "document", id, {
    sourceVersion: requestedVersion,
    archivedVersion,
    restoredVersion,
  });
  return Response.json({ ok: true, sourceVersion: requestedVersion, restoredVersion, updatedAt: now });
}
