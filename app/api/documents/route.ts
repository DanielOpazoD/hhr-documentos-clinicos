import { audit, ensureDatabase, jsonError, requestOwner } from "@/app/lib/server";

const demoDocuments = [
  { id: "demo-certificado", templateId: "certificado_antecedentes", title: "Certificado de antecedentes y fármacos", patientName: "Isidora Mahina Paoa", patientRutMasked: "••.•••.482-•", status: "Revisado", version: 2, updatedAt: "2026-07-24T14:18:00.000Z", demo: true },
  { id: "demo-laboratorio", templateId: "formulario_laboratorio", title: "Solicitud de laboratorio", patientName: "Matías Tuki Tepano", patientRutMasked: "••.•••.731-•", status: "Borrador", version: 1, updatedAt: "2026-07-24T12:42:00.000Z", demo: true },
  { id: "demo-informe", templateId: "informe_medico", title: "Informe médico por secciones", patientName: "Ana María Pakomio", patientRutMasked: "••.•••.164-•", status: "Finalizado", version: 3, updatedAt: "2026-07-23T18:06:00.000Z", demo: true },
];

export async function GET(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const db = await ensureDatabase();
  const result = await db.prepare(`SELECT id, template_id AS templateId, title, patient_name AS patientName, patient_rut_masked AS patientRutMasked, status, version, updated_at AS updatedAt FROM documents WHERE owner_email = ? ORDER BY updated_at DESC LIMIT 30`).bind(owner).all();
  return Response.json({ documents: result.results.length ? result.results : demoDocuments });
}

export async function POST(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const payload = await request.json() as Record<string, unknown>;
  const title = String(payload.title ?? "").trim();
  const patientName = String(payload.patientName ?? "").trim();
  const templateId = String(payload.templateId ?? "documento_libre");
  const status = ["Borrador", "Revisado", "Finalizado"].includes(String(payload.status)) ? String(payload.status) : "Borrador";
  if (!title || !patientName) return jsonError("Título y paciente son obligatorios.");

  const db = await ensureDatabase();
  const id = String(payload.id ?? crypto.randomUUID());
  const now = new Date().toISOString();
  const existing = await db.prepare(`SELECT version FROM documents WHERE id = ? AND owner_email = ?`).bind(id, owner).first<{ version: number }>();
  const version = existing ? existing.version + 1 : 1;
  const contentJson = JSON.stringify(payload.content ?? {});

  if (existing) {
    await db.batch([
      db.prepare(`UPDATE documents SET template_id = ?, title = ?, patient_name = ?, patient_rut_masked = ?, status = ?, content_json = ?, version = ?, updated_at = ? WHERE id = ? AND owner_email = ?`).bind(templateId, title, patientName, String(payload.patientRutMasked ?? "••.•••.•••-•"), status, contentJson, version, now, id, owner),
      db.prepare(`INSERT INTO document_versions (id, document_id, owner_email, version, content_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), id, owner, version, contentJson, now),
    ]);
  } else {
    await db.batch([
      db.prepare(`INSERT INTO documents (id, owner_email, template_id, title, patient_name, patient_rut_masked, status, content_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, owner, templateId, title, patientName, String(payload.patientRutMasked ?? "••.•••.•••-•"), status, contentJson, version, now, now),
      db.prepare(`INSERT INTO document_versions (id, document_id, owner_email, version, content_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), id, owner, version, contentJson, now),
    ]);
  }
  await audit(owner, existing ? "updated" : "created", "document", id, { status, version });
  return Response.json({ document: { id, title, patientName, templateId, status, version, updatedAt: now } }, { status: existing ? 200 : 201 });
}
