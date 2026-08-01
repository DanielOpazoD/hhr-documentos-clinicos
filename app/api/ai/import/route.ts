import { isAiTarget } from "@/app/features/ai/server/prompt";
import { composePromptInstructions, PROFESSIONAL_INSTRUCTION_SOURCE } from "@/app/features/ai/server/prompt-composition";
import { resolvePromptProfile } from "@/app/features/ai/server/prompt-store";
import { PROMPT_ENGINE_VERSION, promptVersion } from "@/app/features/ai/prompt-catalog";
import { generateDraftWithProvider, isAiProviderId } from "@/app/features/ai/server/providers";
import { importSources } from "@/app/features/ai/server/import-request";
import { progressStream } from "@/app/features/ai/server/progress-stream";
import { auditBestEffort } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { apiTrace, jsonError, observeApi, reportApiFailure } from "@/app/lib/server/http";
import { recordAiUsage } from "@/app/features/ai/server/usage";
import type { AiPromptMode, AiTargetId } from "@/app/features/ai/types";
import { FREEFORM_SCHEMA_TARGET } from "@/app/features/ai/targets";
import {
  AiExecutionTimeoutError,
  aiExecutionDeniedResponse,
  failAiExecution,
  reserveAiExecution,
  runAiExecution,
} from "@/app/features/ai/server/execution";

async function updateRunStatus(id: string, status: string) {
  const db = await ensureDatabase();
  await db.prepare("UPDATE ai_import_runs SET status = ? WHERE id = ?").bind(status, id).run();
}

async function updateRunStatusBestEffort(id: string, status: string) {
  try {
    await updateRunStatus(id, status);
  } catch {
    console.error(JSON.stringify({
      level: "error",
      event: "ai_import_status_update_failed",
      status,
    }));
  }
}

async function importWithAi(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);

  const form = await request.formData();
  const requestedTarget = String(form.get("target") ?? "informe_medico");
  const providerId = String(form.get("provider") ?? "openai");
  const model = String(form.get("model") ?? "gpt-5-mini");
  const promptId = String(form.get("promptId") ?? "").trim();
  const promptModeValue = String(form.get("promptMode") ?? "profile");
  const userInstructions = String(form.get("userInstructions") ?? "");
  const processingAuthorized = form.get("processingAuthorized") === "true";

  if (!processingAuthorized) return jsonError("Confirme que tiene autorización para procesar el archivo.");
  if (promptModeValue !== "profile" && promptModeValue !== "free") return jsonError("Modo de prompt no permitido.");
  if (!isAiTarget(requestedTarget)) return jsonError("Tipo de borrador no permitido.");
  if (!isAiProviderId(providerId)) return jsonError("Proveedor de IA no permitido.");
  const promptMode = promptModeValue as AiPromptMode;
  const target: AiTargetId = promptMode === "free" ? FREEFORM_SCHEMA_TARGET : requestedTarget;
  let resolvedPromptId = "free-user-prompt";
  let resolvedPromptVersion = `${PROMPT_ENGINE_VERSION}:free:r1`;
  let resolvedPromptName = "Prompt libre";
  let resolvedPromptRevision: number | null = null;
  let promptInstructions: string;
  try {
    if (promptMode === "free") {
      promptInstructions = composePromptInstructions({ mode: promptMode, userInstructions });
    } else {
      const prompt = await resolvePromptProfile(owner, target, promptId || undefined);
      resolvedPromptId = prompt.id;
      resolvedPromptName = prompt.name;
      resolvedPromptRevision = prompt.revision;
      resolvedPromptVersion = `${promptVersion(prompt)}${userInstructions.trim() ? ":supplemented" : ""}`;
      promptInstructions = composePromptInstructions({
        mode: promptMode,
        baseInstructions: prompt.instructions,
        userInstructions,
      });
    }
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Prompt no disponible.");
  }
  let sources: Awaited<ReturnType<typeof importSources>>;
  try { sources = await importSources(form); } catch (error) {
    return jsonError(error instanceof Error ? error.message : "No se pudieron validar los archivos.");
  }

  const reservation = await reserveAiExecution({
    owner,
    operation: "clinical_draft",
    providerId,
  });
  if (!reservation.ok) return aiExecutionDeniedResponse(reservation.denial);
  const id = reservation.lease.id;
  const sourceLabel = sources.length === 1 ? sources[0].sourceName : `${sources[0].sourceName} + ${sources.length - 1}`;
  const db = await ensureDatabase();
  try {
    await db.prepare(
      "INSERT INTO ai_import_runs (id, owner_email, source_name, target_type, status, created_at) VALUES (?, ?, ?, ?, 'procesando', ?)",
    ).bind(id, owner, sourceLabel, promptMode === "free" ? "libre" : target, new Date().toISOString()).run();
  } catch (error) {
    await failAiExecution(reservation.lease).catch(() => undefined);
    throw error;
  }

  const trace = apiTrace(request);
  let streamCode = "AI_GENERATION_FAILED";
  let streamMessage = "No se pudo completar la operación.";
  let streamStatus = 502;
  return progressStream(async (emit) => {
    emit({ type: "status", stage: "preparing", label: "Preparando archivos", detail: `${sources.length} fuente${sources.length === 1 ? "" : "s"} lista${sources.length === 1 ? "" : "s"} para analizar` });
    try {
      const { output: result, provider, usage } = await runAiExecution(
        reservation.lease,
        (signal) => generateDraftWithProvider({
          providerId,
          model,
          sources,
          target,
          promptMode,
          promptInstructions,
          professionalInstructions: userInstructions.trim() || undefined,
          onProgress: (progress) => emit({ type: "status", ...progress }),
          signal,
        }),
      );
      await updateRunStatusBestEffort(id, "completado");
      const usageRecorded = await recordAiUsage({
        owner,
        runId: id,
        providerId: provider.id,
        model: provider.model,
        usage,
      }).then(() => true).catch(() => false);
      await auditBestEffort(owner, "generated", "ai_import", id, {
        sourceNames: sources.map((source) => source.sourceName),
        target,
        provider: provider.id,
        model: provider.model,
        promptId: resolvedPromptId,
        promptVersion: resolvedPromptVersion,
        promptMode,
        supplemented: promptMode === "profile" && Boolean(userInstructions.trim()),
        mimeTypes: sources.map((source) => source.mimeType),
        totalSize: sources.reduce((total, source) => total + source.file.size, 0),
        store: false,
        processingAuthorized: true,
        usageRecorded,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
      emit({ type: "status", stage: "completed", label: "Borrador listo", detail: "Identidad, contenido y fuentes preparados para revisión" });
      const generatedAt = new Date().toISOString();
      const resultSources = [
        ...sources.map((source) => source.sourceName),
        ...(userInstructions.trim() ? [PROFESSIONAL_INSTRUCTION_SOURCE] : []),
      ];
      const originalOutput = {
        documentKind: result.documentKind,
        patient: result.patient,
        signer: result.signer,
        sections: result.sections,
        processingSummary: result.processingSummary,
        missingInformation: result.missingInformation,
        safetyNotice: result.safetyNotice,
      };
      emit({ type: "result", result: {
        runId: id,
        documentKind: result.documentKind,
        sources: resultSources,
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        promptVersion: resolvedPromptVersion,
        promptTrace: {
          mode: promptMode,
          profileId: resolvedPromptId,
          profileName: resolvedPromptName,
          profileRevision: resolvedPromptRevision,
          version: resolvedPromptVersion,
          userInstructions: userInstructions.trim(),
          effectiveInstructions: promptInstructions,
          generatedAt,
        },
        originalOutput,
        sections: result.sections,
        patient: result.patient,
        signer: result.signer,
        processingSummary: result.processingSummary,
        missingInformation: result.missingInformation,
        safetyNotice: result.safetyNotice,
      } });
    } catch (error) {
      if (error instanceof AiExecutionTimeoutError) {
        streamCode = error.code;
        streamMessage = error.message;
        streamStatus = 504;
      }
      await updateRunStatusBestEffort(id, "fallido");
      await auditBestEffort(owner, "failed", "ai_import", id, {
        sourceNames: sources.map((source) => source.sourceName),
        target,
        provider: providerId,
        promptId: resolvedPromptId,
        promptVersion: resolvedPromptVersion,
        promptMode,
      });
      throw error;
    }
  }, {
    code: () => streamCode,
    errorMessage: () => streamMessage,
    requestId: trace?.requestId,
    onError: () => {
      if (trace) reportApiFailure({ ...trace, status: streamStatus, code: streamCode });
    },
  });
}

export const POST = observeApi("ai.import.POST", importWithAi);
