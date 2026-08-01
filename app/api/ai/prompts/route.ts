import { listPromptProfiles } from "@/app/features/ai/server/prompt-store";
import { validatePromptInput } from "@/app/features/ai/server/prompt-validation";
import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { jsonError, observeApi, readJsonObject } from "@/app/lib/server/http";

async function getPrompts(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  return Response.json({ prompts: await listPromptProfiles(owner) });
}

async function createPrompt(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const body = await readJsonObject(request);
  if (!body) return jsonError("Solicitud no válida.");
  let input;
  try { input = validatePromptInput(body); } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Prompt no válido.");
  }

  const db = await ensureDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements = [];
  if (input.makeDefault) {
    statements.push(db.prepare("UPDATE ai_prompts SET is_default = 0 WHERE owner_email = ? AND target_type = ?").bind(owner, input.target));
  }
  statements.push(db.prepare(
    "INSERT INTO ai_prompts (id, owner_email, name, target_type, instructions, revision, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)",
  ).bind(id, owner, input.name, input.target, input.instructions, input.makeDefault ? 1 : 0, now, now));
  await db.batch(statements);
  await audit(owner, "created", "ai_prompt", id, { target: input.target, makeDefault: Boolean(input.makeDefault) });
  const prompts = await listPromptProfiles(owner);
  return Response.json({ prompt: prompts.find((item) => item.id === id), prompts }, { status: 201 });
}

export const GET = observeApi("ai.prompts.GET", getPrompts);
export const POST = observeApi("ai.prompts.POST", createPrompt);
