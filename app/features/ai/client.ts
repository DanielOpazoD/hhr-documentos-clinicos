import type { AiImportResult, AiProgress, AiProviderId, AiProviderInfo, AiTargetId } from "./types";
import { documentTemplateForAiTarget } from "./targets";

async function responseData<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({
    error: response.status === 413
      ? "El archivo es demasiado grande. Use una versión más liviana."
      : "No se pudo leer la respuesta del servidor.",
  })) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "No se pudo completar la operación.");
  return data;
}

export async function importWithAi(
  files: File[],
  target: AiTargetId,
  provider: AiProviderId,
  promptId: string,
  processingAuthorized: boolean,
  onProgress?: (progress: AiProgress) => void,
): Promise<AiImportResult> {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  form.set("target", target);
  form.set("provider", provider);
  form.set("promptId", promptId);
  form.set("processingAuthorized", String(processingAuthorized));
  const response = await fetch("/api/ai/import", { method: "POST", body: form });
  if (!response.ok) return responseData<AiImportResult>(response);
  if (!response.body) throw new Error("El servidor no inició el procesamiento.");

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let result: AiImportResult | null = null;
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
        | { type: "error"; error: string };
      if (event.type === "status") onProgress?.(event);
      if (event.type === "result") result = event.result;
      if (event.type === "error") throw new Error(event.error);
    }
    if (chunk.done) break;
  }
  if (!result) throw new Error("La IA no devolvió un borrador utilizable.");
  return result;
}

export async function fetchAiProviders(): Promise<AiProviderInfo[]> {
  const response = await fetch("/api/ai/providers", { cache: "no-store" });
  const data = await responseData<{ providers: AiProviderInfo[] }>(response);
  return data.providers;
}

export async function saveAiDraft(result: AiImportResult, target: AiTargetId, title: string, documentId?: string) {
  const patientName = [result.patient.firstNames, result.patient.lastNames].filter(Boolean).join(" ");
  const response = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(documentId ? { id: documentId } : {}),
      templateId: documentTemplateForAiTarget(target),
      title,
      patientName,
      patientRutMasked: result.patient.rut,
      status: "Borrador",
      content: {
        patient: result.patient,
        signer: result.signer,
        sections: result.sections.map((section, index) => ({
          id: section.key ?? `ia-${index + 1}`,
          title: section.title,
          body: section.text,
        })),
        ai: {
          sources: result.sources,
          provider: result.providerId,
          providerName: result.providerName,
          model: result.model,
          promptVersion: result.promptVersion,
          evidence: Object.fromEntries(result.sections.map((section, index) => [section.key ?? `ia-${index + 1}`, section.evidence])),
          editedSectionIds: result.sections.flatMap((section, index) => section.evidenceStale ? [section.key ?? `ia-${index + 1}`] : []),
          missingInformation: result.missingInformation,
          safetyNotice: result.safetyNotice,
        },
      },
    }),
  });
  const data = await responseData<{ document: { id: string } }>(response);
  return data.document.id;
}
