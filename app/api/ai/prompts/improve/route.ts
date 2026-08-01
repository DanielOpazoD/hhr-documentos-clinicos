import { improvePrompt } from "@/app/features/ai/server/prompt-improvement";
import { validatePromptInput } from "@/app/features/ai/server/prompt-validation";
import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { jsonError, observeApi, readJsonObject } from "@/app/lib/server/http";

async function improveSavedPrompt(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const body = await readJsonObject(request);
  if (!body) return jsonError("Solicitud no válida.");
  let input;
  try {
    input = validatePromptInput({ ...body, makeDefault: false });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Prompt no válido.");
  }
  try {
    const result = await improvePrompt(input);
    await audit(owner, "improved", "ai_prompt", crypto.randomUUID(), {
      target: input.target,
      sourceLength: input.instructions.length,
      resultLength: result.instructions.length,
      model: result.model,
    });
    return Response.json({ improvement: { name: result.name, instructions: result.instructions, summary: result.summary } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "No se pudo mejorar el prompt.", 502);
  }
}

export const POST = observeApi("ai.prompts.improve.POST", improveSavedPrompt);
