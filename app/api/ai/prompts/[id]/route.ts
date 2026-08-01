import { builtInPromptById } from "@/app/features/ai/prompt-catalog";
import { listPromptProfiles } from "@/app/features/ai/server/prompt-store";
import { validatePromptInput } from "@/app/features/ai/server/prompt-validation";
import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { jsonError, observeApi, readJsonObject } from "@/app/lib/server/http";

type PromptRow = { id: string; name: string; target: string; instructions: string; revision: number; isDefault: number };

async function customPrompt(owner: string, id: string): Promise<PromptRow | null> {
  const db = await ensureDatabase();
  return db.prepare(`SELECT id, name, target_type AS target, instructions, revision, is_default AS isDefault
    FROM ai_prompts WHERE id = ? AND owner_email = ?`).bind(id, owner).first<PromptRow>();
}

async function updatePrompt(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const { id } = await context.params;
  if (builtInPromptById(id)) return jsonError("Los prompts base se duplican antes de editarlos.", 409);
  const current = await customPrompt(owner, id);
  if (!current) return jsonError("Prompt no encontrado.", 404);
  const body = await readJsonObject(request);
  if (!body) return jsonError("Solicitud no válida.");
  let input;
  try {
    input = validatePromptInput({
      name: body.name ?? current.name,
      target: body.target ?? current.target,
      instructions: body.instructions ?? current.instructions,
      makeDefault: body.makeDefault ?? Boolean(current.isDefault),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Prompt no válido.");
  }

  const db = await ensureDatabase();
  const changed = input.name !== current.name || input.target !== current.target || input.instructions !== current.instructions;
  const now = new Date().toISOString();
  const statements = [];
  if (input.makeDefault) {
    statements.push(db.prepare("UPDATE ai_prompts SET is_default = 0 WHERE owner_email = ? AND target_type = ?").bind(owner, input.target));
  }
  statements.push(db.prepare(`UPDATE ai_prompts SET name = ?, target_type = ?, instructions = ?, revision = ?, is_default = ?, updated_at = ?
    WHERE id = ? AND owner_email = ?`).bind(
      input.name,
      input.target,
      input.instructions,
      changed ? current.revision + 1 : current.revision,
      input.makeDefault ? 1 : 0,
      now,
      id,
      owner,
    ));
  await db.batch(statements);
  await audit(owner, "updated", "ai_prompt", id, { target: input.target, revision: changed ? current.revision + 1 : current.revision, makeDefault: Boolean(input.makeDefault) });
  const prompts = await listPromptProfiles(owner);
  return Response.json({ prompt: prompts.find((item) => item.id === id), prompts });
}

async function deletePrompt(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const { id } = await context.params;
  if (builtInPromptById(id)) return jsonError("Los prompts base no se pueden eliminar.", 409);
  const current = await customPrompt(owner, id);
  if (!current) return jsonError("Prompt no encontrado.", 404);
  const db = await ensureDatabase();
  await db.prepare("DELETE FROM ai_prompts WHERE id = ? AND owner_email = ?").bind(id, owner).run();
  await audit(owner, "deleted", "ai_prompt", id, { target: current.target, revision: current.revision });
  return Response.json({ ok: true, prompts: await listPromptProfiles(owner) });
}

export const PATCH = observeApi("ai.prompts.id.PATCH", updatePrompt);
export const DELETE = observeApi("ai.prompts.id.DELETE", deletePrompt);
