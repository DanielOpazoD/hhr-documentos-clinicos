import { aiTargetForDocumentTemplate } from "@/app/features/ai/targets";
import { resolvePromptProfile } from "@/app/features/ai/server/prompt-store";
import type { DocumentTemplateSetting } from "@/app/features/documents/types";
import { documentTemplates } from "@/app/lib/catalog";
import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { jsonError, observeApi, readJsonObject } from "@/app/lib/server/http";

type TemplateSettingRow = {
  templateId: string;
  title: string;
  sectionsJson: string;
  promptId: string | null;
  updatedAt: string;
};

const validTemplateIds = new Set(documentTemplates.map((template) => template.id));

function fromRow(row: TemplateSettingRow): DocumentTemplateSetting | null {
  try {
    const sections = JSON.parse(row.sectionsJson) as unknown;
    if (!Array.isArray(sections)) return null;
    return { ...row, sections: sections as DocumentTemplateSetting["sections"] };
  } catch {
    return null;
  }
}

function validateSetting(body: Record<string, unknown>): DocumentTemplateSetting {
  const templateId = typeof body.templateId === "string" ? body.templateId : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const promptId = typeof body.promptId === "string" && body.promptId.trim() ? body.promptId.trim() : null;
  if (!validTemplateIds.has(templateId as typeof documentTemplates[number]["id"])) throw new Error("La plantilla no es válida.");
  if (!title || title.length > 120) throw new Error("El título debe tener entre 1 y 120 caracteres.");
  if (!Array.isArray(body.sections) || !body.sections.length || body.sections.length > 12) throw new Error("La plantilla debe tener entre 1 y 12 secciones.");
  const ids = new Set<string>();
  const sections = body.sections.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Hay una sección no válida.");
    const item = value as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const sectionTitle = typeof item.title === "string" ? item.title.trim() : "";
    if (!id || id.length > 80 || ids.has(id)) throw new Error("Cada sección debe tener un identificador único.");
    if (!sectionTitle || sectionTitle.length > 80) throw new Error("Cada sección debe tener un título de hasta 80 caracteres.");
    ids.add(id);
    return { id, title: sectionTitle };
  });
  if (templateId === "receta_externa" && (sections.length !== 1 || sections[0].id !== "prescripcion" || sections[0].title !== "Rp.")) {
    throw new Error("La receta externa tiene una estructura fija.");
  }
  return { templateId, title, sections, promptId };
}

async function getSettings(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const db = await ensureDatabase();
  const result = await db.prepare(`SELECT template_id AS templateId, title, sections_json AS sectionsJson,
    prompt_id AS promptId, updated_at AS updatedAt FROM document_template_settings
    WHERE owner_email = ? ORDER BY template_id`).bind(owner).all<TemplateSettingRow>();
  return Response.json({ settings: result.results.map(fromRow).filter(Boolean) });
}

async function putSetting(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const body = await readJsonObject(request);
  if (!body) return jsonError("Solicitud no válida.");
  let setting;
  try { setting = validateSetting(body); } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Plantilla no válida.");
  }
  const target = aiTargetForDocumentTemplate(setting.templateId);
  if (setting.promptId && !target) return jsonError("Esta plantilla no admite generación con IA.");
  if (setting.promptId && target) {
    try { await resolvePromptProfile(owner, target, setting.promptId); } catch (error) {
      return jsonError(error instanceof Error ? error.message : "El prompt no está disponible.");
    }
  }
  const db = await ensureDatabase();
  const now = new Date().toISOString();
  const current = await db.prepare(`SELECT id, created_at AS createdAt FROM document_template_settings
    WHERE owner_email = ? AND template_id = ?`).bind(owner, setting.templateId).first<{ id: string; createdAt: string }>();
  const id = current?.id ?? crypto.randomUUID();
  await db.prepare(`INSERT INTO document_template_settings
    (id, owner_email, template_id, title, sections_json, prompt_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_email, template_id) DO UPDATE SET title = excluded.title,
      sections_json = excluded.sections_json, prompt_id = excluded.prompt_id, updated_at = excluded.updated_at`)
    .bind(id, owner, setting.templateId, setting.title, JSON.stringify(setting.sections), setting.promptId, current?.createdAt ?? now, now).run();
  await audit(owner, current ? "updated" : "created", "document_template_setting", setting.templateId, {
    prompt: Boolean(setting.promptId), sections: setting.sections.length,
  });
  return Response.json({ setting: { ...setting, updatedAt: now } });
}

export const GET = observeApi("document-templates.GET", getSettings);
export const PUT = observeApi("document-templates.PUT", putSetting);
