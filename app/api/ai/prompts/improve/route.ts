import { improvePrompt } from "@/app/features/ai/server/prompt-improvement";
import { validatePromptInput } from "@/app/features/ai/server/prompt-validation";
import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { jsonError, observeApi, readJsonObject } from "@/app/lib/server/http";
import {
  AiExecutionTimeoutError,
  aiExecutionDeniedResponse,
  reserveAiExecution,
  runAiExecution,
} from "@/app/features/ai/server/execution";
import { recordAiUsage } from "@/app/features/ai/server/usage";

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
  const reservation = await reserveAiExecution({
    owner,
    operation: "prompt_improvement",
    providerId: "openai",
  });
  if (!reservation.ok) return aiExecutionDeniedResponse(reservation.denial);
  try {
    const result = await runAiExecution(
      reservation.lease,
      (signal) => improvePrompt(input, { signal }),
    );
    const usageRecorded = await recordAiUsage({
      owner,
      runId: reservation.lease.id,
      providerId: "openai",
      model: result.model,
      usage: result.usage,
    }).then(() => true).catch(() => false);
    await audit(owner, "improved", "ai_prompt", crypto.randomUUID(), {
      target: input.target,
      sourceLength: input.instructions.length,
      resultLength: result.instructions.length,
      model: result.model,
      usageRecorded,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });
    return Response.json({ improvement: { name: result.name, instructions: result.instructions, summary: result.summary } });
  } catch (error) {
    if (error instanceof AiExecutionTimeoutError) {
      return jsonError(error.message, 504, error.code);
    }
    return jsonError(error instanceof Error ? error.message : "No se pudo mejorar el prompt.", 502);
  }
}

export const POST = observeApi("ai.prompts.improve.POST", improveSavedPrompt);
