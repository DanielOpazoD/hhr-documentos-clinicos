import type { AiImportResult, AiProgress, AiPromptMode, AiProviderId, AiProviderInfo, AiTargetId } from "./types";
import { mergeAiSectionsWithTemplate } from "@/app/features/documents/template-ai-sections";
import { createSections } from "@/app/features/documents/templates";
import type { DocumentTemplateSectionSetting } from "@/app/features/documents/types";
import { ApiClientError, readApiResponse } from "@/app/lib/client/http";

export async function importWithAi(
  input: {
    files: File[];
    target: AiTargetId;
    provider: AiProviderId;
    model: string;
    promptId: string;
    promptMode: AiPromptMode;
    userInstructions: string;
    processingAuthorized: boolean;
  },
  onProgress?: (progress: AiProgress) => void,
  signal?: AbortSignal,
): Promise<AiImportResult> {
  const form = new FormData();
  input.files.forEach((file) => form.append("files", file));
  form.set("target", input.target);
  form.set("provider", input.provider);
  form.set("model", input.model);
  form.set("promptId", input.promptId);
  form.set("promptMode", input.promptMode);
  form.set("userInstructions", input.userInstructions);
  form.set("processingAuthorized", String(input.processingAuthorized));
  const response = await fetch("/api/ai/import", { method: "POST", body: form, signal });
  if (!response.ok) return readApiResponse<AiImportResult>(response, {
    fallbackMessage: "No se pudo leer la respuesta del servidor.",
  });
  if (!response.body) throw new Error("El servidor no inició el procesamiento.");

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const cancelReader = () => { void reader.cancel().catch(() => undefined); };
  if (signal?.aborted) cancelReader();
  else signal?.addEventListener("abort", cancelReader, { once: true });
  let buffer = "";
  let result: AiImportResult | null = null;
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += chunk.value ?? "";
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as
          | ({ type: "status" } & AiProgress)
          | { type: "result"; result: AiImportResult }
          | { type: "workflow"; workflow: AiImportResult["workflow"] }
          | { type: "error"; error: string; code?: string; requestId?: string };
        if (event.type === "status") onProgress?.(event);
        if (event.type === "result") result = event.result;
        if (event.type === "workflow") {
          if (!result) throw new Error("La traza de generación llegó fuera de orden.");
          result = { ...result, workflow: event.workflow };
        }
        if (event.type === "error") {
          throw new ApiClientError({
            message: event.error,
            status: 502,
            code: event.code,
            requestId: event.requestId,
          });
        }
      }
      if (chunk.done) break;
    }
  } finally {
    signal?.removeEventListener("abort", cancelReader);
  }
  if (signal?.aborted) throw new DOMException("Operación cancelada.", "AbortError");
  if (!result) throw new Error("La IA no devolvió un borrador utilizable.");
  return result;
}

export async function fetchAiProviders(): Promise<AiProviderInfo[]> {
  const response = await fetch("/api/ai/providers", { cache: "no-store" });
  const data = await readApiResponse<{ providers: AiProviderInfo[] }>(response);
  return data.providers;
}

export async function saveAiDraft(
  result: AiImportResult,
  title: string,
  templateId: string,
  templateSections?: DocumentTemplateSectionSetting[],
  documentId?: string,
) {
  const patientName = [result.patient.firstNames, result.patient.lastNames].filter(Boolean).join(" ");
  const sections = mergeAiSectionsWithTemplate(result.sections, templateSections, createSections(templateId));
  const response = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(documentId ? { id: documentId } : {}),
      templateId,
      title,
      patientName,
      patientRutMasked: result.patient.rut,
      status: "Borrador",
      content: {
        patient: result.patient,
        signer: result.signer,
        sections: sections.map(({ id, title: sectionTitle, body }) => ({ id, title: sectionTitle, body })),
        ai: {
          sources: result.sources,
          provider: result.providerId,
          providerName: result.providerName,
          model: result.model,
          promptVersion: result.promptVersion,
          workflow: result.workflow,
          promptTrace: result.promptTrace,
          originalOutput: result.originalOutput,
          evidence: Object.fromEntries(sections.map((section) => [section.id, section.evidence])),
          editedSectionIds: sections.flatMap((section) => section.evidenceStale ? [section.id] : []),
          missingInformation: result.missingInformation,
          safetyNotice: result.safetyNotice,
        },
      },
    }),
  });
  const data = await readApiResponse<{ document: { id: string } }>(response);
  return data.document.id;
}
