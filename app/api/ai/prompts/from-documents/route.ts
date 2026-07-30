import { createPromptFromDocuments, type PromptSourceDocument } from "@/app/features/ai/server/prompt-from-documents";
import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { jsonError, readJsonObject } from "@/app/lib/server/http";

const MAX_SOURCE_DOCUMENTS = 8;

type DocumentRow = { id: string; templateId: string; contentJson: string };

const SAFE_TEMPLATE_IDS = new Set([
  "certificado_general",
  "certificado_antecedentes",
  "informe_medico",
  "epicrisis",
  "receta_externa",
  "documento_libre",
]);

function sectionLength(characters: number): "vacia" | "breve" | "media" | "extensa" {
  if (!characters) return "vacia";
  if (characters <= 300) return "breve";
  if (characters <= 1_500) return "media";
  return "extensa";
}

function sourceDocument(row: DocumentRow): PromptSourceDocument {
  let content: {
    sections?: Array<{ title?: unknown; body?: unknown; text?: unknown }>;
  } = {};
  try { content = JSON.parse(row.contentJson) as typeof content; } catch { content = {}; }
  const sections = content.sections ?? [];
  return {
    templateId: SAFE_TEMPLATE_IDS.has(row.templateId) ? row.templateId : "documento_libre",
    sectionCount: Math.min(100, sections.length),
    sections: sections.slice(0, 16).map((section, index) => {
      const body = typeof section.body === "string" ? section.body.trim() : typeof section.text === "string" ? section.text.trim() : "";
      const paragraphs = body ? body.split(/\n\s*\n/u).filter(Boolean).length : 0;
      return {
        order: index + 1,
        length: sectionLength(body.length),
        paragraphs: Math.min(20, paragraphs),
      };
    }),
  };
}

export async function POST(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const body = await readJsonObject(request);
  const ids = [...new Set(Array.isArray(body?.ids) ? body.ids.map((id) => String(id).trim()).filter(Boolean) : [])];
  if (!ids.length) return jsonError("Seleccione al menos un documento.");
  if (ids.length > MAX_SOURCE_DOCUMENTS) return jsonError(`Puede usar hasta ${MAX_SOURCE_DOCUMENTS} documentos por plantilla.`);
  const db = await ensureDatabase();
  const placeholders = ids.map(() => "?").join(",");
  const selected = await db.prepare(
    `SELECT id, template_id AS templateId, content_json AS contentJson FROM documents WHERE owner_email = ? AND id IN (${placeholders})`,
  ).bind(owner, ...ids).all<DocumentRow>();
  if (selected.results.length !== ids.length) return jsonError("Uno o más documentos no están disponibles.", 404);
  try {
    const selectedById = new Map(selected.results.map((row) => [row.id, row]));
    const orderedDocuments = ids.map((id) => sourceDocument(selectedById.get(id)!));
    const proposal = await createPromptFromDocuments(orderedDocuments);
    const proposalId = crypto.randomUUID();
    await audit(owner, "proposed_from_documents", "ai_prompt_proposal", proposalId, {
      target: proposal.target,
      documentIds: ids,
      documentCount: ids.length,
      model: proposal.model,
    });
    return Response.json({
      proposal: {
        name: proposal.name,
        target: proposal.target,
        instructions: proposal.instructions,
      },
      summary: proposal.summary,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "No se pudo crear la plantilla.", 502);
  }
}
