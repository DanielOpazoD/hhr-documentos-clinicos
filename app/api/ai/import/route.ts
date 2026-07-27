import { isAiTarget } from "@/app/features/ai/server/prompt";
import { resolvePromptProfile } from "@/app/features/ai/server/prompt-store";
import { promptVersion } from "@/app/features/ai/prompt-catalog";
import { generateDraftWithProvider, isAiProviderId } from "@/app/features/ai/server/providers";
import { importSources } from "@/app/features/ai/server/import-request";
import { progressStream } from "@/app/features/ai/server/progress-stream";
import { audit } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { jsonError } from "@/app/lib/server/http";
import { recordAiUsage } from "@/app/features/ai/server/usage";

async function updateRunStatus(id: string, status: string) {
  const db = await ensureDatabase();
  await db.prepare("UPDATE ai_import_runs SET status = ? WHERE id = ?").bind(status, id).run();
}

export async function POST(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);

  const form = await request.formData();
  const target = String(form.get("target") ?? "resumen");
  const providerId = String(form.get("provider") ?? "openai");
  const model = String(form.get("model") ?? "gpt-5-mini");
  const promptId = String(form.get("promptId") ?? "").trim();
  const processingAuthorized = form.get("processingAuthorized") === "true";

  if (!processingAuthorized) return jsonError("Confirme que tiene autorización para procesar el archivo.");
  if (!isAiTarget(target)) return jsonError("Tipo de borrador no permitido.");
  if (!isAiProviderId(providerId)) return jsonError("Proveedor de IA no permitido.");
  let prompt;
  try { prompt = await resolvePromptProfile(owner, target, promptId || undefined); } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Prompt no disponible.");
  }
  const resolvedPromptVersion = promptVersion(prompt);
  let sources: ReturnType<typeof importSources>;
  try { sources = importSources(form); } catch (error) {
    return jsonError(error instanceof Error ? error.message : "No se pudieron validar los archivos.");
  }

  const id = crypto.randomUUID();
  const sourceLabel = sources.length === 1 ? sources[0].sourceName : `${sources[0].sourceName} + ${sources.length - 1}`;
  const db = await ensureDatabase();
  await db.prepare(
    "INSERT INTO ai_import_runs (id, owner_email, source_name, target_type, status, created_at) VALUES (?, ?, ?, ?, 'procesando', ?)",
  ).bind(id, owner, sourceLabel, target, new Date().toISOString()).run();

  return progressStream(async (emit) => {
    emit({ type: "status", stage: "preparing", label: "Preparando archivos", detail: `${sources.length} fuente${sources.length === 1 ? "" : "s"} lista${sources.length === 1 ? "" : "s"} para analizar` });
    try {
      const { output: result, provider, usage } = await generateDraftWithProvider({
        providerId,
        model,
        sources,
        target,
        promptInstructions: prompt.instructions,
        onProgress: (progress) => emit({ type: "status", ...progress }),
      });
      await updateRunStatus(id, "completado");
      const usageRecorded = await recordAiUsage({
        owner,
        runId: id,
        providerId: provider.id,
        model: provider.model,
        usage,
      }).then(() => true).catch(() => false);
      await audit(owner, "generated", "ai_import", id, {
        sourceNames: sources.map((source) => source.sourceName),
        target,
        provider: provider.id,
        model: provider.model,
        promptId: prompt.id,
        promptVersion: resolvedPromptVersion,
        mimeTypes: sources.map((source) => source.mimeType),
        totalSize: sources.reduce((total, source) => total + source.file.size, 0),
        store: false,
        processingAuthorized: true,
        usageRecorded,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
      emit({ type: "status", stage: "completed", label: "Borrador listo", detail: "Identidad, contenido y fuentes preparados para revisión" });
      emit({ type: "result", result: {
        runId: id,
        sources: sources.map((source) => source.sourceName),
        providerId: provider.id,
        providerName: provider.name,
        model: provider.model,
        promptVersion: resolvedPromptVersion,
        sections: result.sections,
        patient: result.patient,
        signer: result.signer,
        processingSummary: result.processingSummary,
        missingInformation: result.missingInformation,
        safetyNotice: result.safetyNotice,
      } });
    } catch (error) {
      await updateRunStatus(id, "fallido");
      await audit(owner, "failed", "ai_import", id, {
        sourceNames: sources.map((source) => source.sourceName),
        target,
        provider: providerId,
        promptId: prompt.id,
        promptVersion: resolvedPromptVersion,
      });
      throw error;
    }
  });
}
