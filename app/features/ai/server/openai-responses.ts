import { outputSchema, systemPrompt } from "./prompt";
import type { AiEvidence, AiPatient, AiProgressReporter, AiPromptMode, AiSigner, AiSourceInput, AiTargetId } from "../types";
import { parseClinicalOutput } from "./clinical-output";
import { extractLocalSource, getPdfPageCount } from "./source-extraction";
import type { AiTokenUsage } from "../usage-types";
import { supportsReasoning } from "./openai-models";
import { PROFESSIONAL_INSTRUCTION_SOURCE } from "./prompt-composition";
import { extractAiTokenUsage } from "./token-usage";

export type OpenAiOutput = {
  documentKind: string;
  patient: AiPatient;
  signer: AiSigner;
  processingSummary: string;
  reasoningSummary?: string;
  sections: Array<{
    key?: string;
    title: string;
    text: string;
    evidence: AiEvidence[];
  }>;
  missingInformation: string[];
  safetyNotice: string;
};

type OpenAiErrorPayload = {
  error?: { code?: unknown; type?: unknown; param?: unknown };
  status?: unknown;
  incomplete_details?: { reason?: unknown };
};

export class OpenAiGenerationError extends Error {
  readonly publicCode: string;
  readonly publicStatus: number;
  readonly upstreamStatus: number;
  readonly upstreamCode: string | null;

  constructor(input: {
    message: string;
    publicCode: string;
    publicStatus: number;
    upstreamStatus: number;
    upstreamCode?: string | null;
  }) {
    super(input.message);
    this.name = "OpenAiGenerationError";
    this.publicCode = input.publicCode;
    this.publicStatus = input.publicStatus;
    this.upstreamStatus = input.upstreamStatus;
    this.upstreamCode = input.upstreamCode ?? null;
  }
}

function safeOpenAiField(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_.-]{1,80}$/i.test(value) ? value : null;
}

export function classifyOpenAiFailure(status: number, payload: unknown): OpenAiGenerationError {
  const error = (payload as OpenAiErrorPayload | null)?.error;
  const code = safeOpenAiField(error?.code);
  if (status === 401 || code === "invalid_api_key") {
    return new OpenAiGenerationError({
      message: "La credencial de OpenAI no es válida o dejó de estar activa.",
      publicCode: "AI_PROVIDER_AUTH_FAILED",
      publicStatus: 503,
      upstreamStatus: status,
      upstreamCode: code,
    });
  }
  if (code === "insufficient_quota") {
    return new OpenAiGenerationError({
      message: "El proyecto de OpenAI no tiene saldo o alcanzó su límite de gasto.",
      publicCode: "AI_PROVIDER_QUOTA_EXHAUSTED",
      publicStatus: 503,
      upstreamStatus: status,
      upstreamCode: code,
    });
  }
  if (status === 429 || code === "rate_limit_exceeded") {
    return new OpenAiGenerationError({
      message: "OpenAI está recibiendo demasiadas solicitudes. Espere unos segundos y reintente.",
      publicCode: "AI_PROVIDER_RATE_LIMITED",
      publicStatus: 503,
      upstreamStatus: status,
      upstreamCode: code,
    });
  }
  if (status === 403 || code === "model_not_found") {
    return new OpenAiGenerationError({
      message: "El modelo seleccionado no está disponible para este proyecto de OpenAI.",
      publicCode: "AI_MODEL_UNAVAILABLE",
      publicStatus: 502,
      upstreamStatus: status,
      upstreamCode: code,
    });
  }
  if (status >= 500) {
    return new OpenAiGenerationError({
      message: "OpenAI no está disponible temporalmente. Reintente en unos minutos.",
      publicCode: "AI_PROVIDER_UNAVAILABLE",
      publicStatus: 503,
      upstreamStatus: status,
      upstreamCode: code,
    });
  }
  return new OpenAiGenerationError({
    message: "OpenAI rechazó la solicitud. Pruebe otro modelo o revise la configuración del proyecto.",
    publicCode: "AI_PROVIDER_REQUEST_REJECTED",
    publicStatus: 502,
    upstreamStatus: status,
    upstreamCode: code,
  });
}

function maxOutputTokens(model: string, target: AiTargetId): number {
  const expanded = model.toLowerCase().startsWith("gpt-5.6");
  if (target === "traslado_salvador") return expanded ? 16_000 : 9_000;
  return expanded ? 12_000 : 6_500;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)));
  }
  return btoa(chunks.join(""));
}

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as {
    output?: Array<{
      content?: Array<{ type?: string; text?: string; refusal?: string }>;
    }>;
  };
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
      if (content.type === "refusal" && content.refusal) {
        throw new Error("El modelo rechazó procesar este archivo.");
      }
    }
  }
  return null;
}

function extractReasoningSummary(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as { output?: Array<{ type?: string; summary?: Array<{ text?: string }> }> };
  const text = response.output
    ?.filter((item) => item.type === "reasoning")
    .flatMap((item) => item.summary ?? [])
    .map((item) => item.text?.trim())
    .filter(Boolean)
    .join("\n");
  return text || null;
}

function sourceContent(file: File, sourceName: string, mimeType: string) {
  return file.arrayBuffer().then((buffer) => {
    const fileData = `data:${mimeType};base64,${toBase64(buffer)}`;
    return mimeType.startsWith("image/")
      ? { type: "input_image", image_url: fileData, detail: "high" }
      : {
          type: "input_file",
          filename: sourceName,
          file_data: fileData,
          ...(mimeType === "application/pdf" ? { detail: "high" } : {}),
        };
  });
}

export async function generateClinicalDraft(input: {
  apiKey: string;
  model: string;
  sources: AiSourceInput[];
  target: AiTargetId;
  promptMode?: AiPromptMode;
  promptInstructions: string;
  professionalInstructions?: string;
  onProgress?: AiProgressReporter;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}): Promise<{ output: OpenAiOutput; usage: AiTokenUsage }> {
  const schema = outputSchema(input.target);
  const professionalInstructions = input.professionalInstructions?.trim() ?? "";
  await input.onProgress?.({ stage: "reading", label: "Leyendo documentos", detail: `Preparando ${input.sources.length} fuente${input.sources.length === 1 ? "" : "s"}` });
  const sourceTexts = await Promise.all(input.sources.map((source) =>
    extractLocalSource(source.file, source.mimeType).catch(() => null),
  ));
  const sourcePageCounts = await Promise.all(input.sources.map((source, index) =>
    source.mimeType === "application/pdf" && sourceTexts[index] === null
      ? getPdfPageCount(source.file).catch(() => null)
      : Promise.resolve(null),
  ));
  const instructionSourceIndex = input.sources.length;
  const content = (await Promise.all(input.sources.map(async (source, index) => {
    const extractedText = sourceTexts[index];
    const original = source.mimeType === "application/json"
      ? null
      : await sourceContent(source.file, source.sourceName, source.mimeType);
    const pageGuidance = source.mimeType === "application/pdf"
      ? ` Es un PDF${sourcePageCounts[index] ? ` de ${sourcePageCounts[index]} páginas` : ""}; cada cita debe indicar el número de página real del PDF.`
      : "";
    return [
      { type: "input_text", text: `FUENTE ${index + 1} · source_index ${index}: ${source.sourceName}.${pageGuidance}` },
      ...(original ? [original] : []),
      ...(extractedText !== null
        ? [{ type: "input_text", text: `TEXTO EXTRAÍDO PARA VERIFICACIÓN DE LA FUENTE ${index + 1}:\n${extractedText}` }]
        : []),
    ];
  }))).flat();
  await input.onProgress?.({ stage: "analyzing", label: "Identificando datos clínicos", detail: "Contrastando identidad, fechas y hallazgos entre las fuentes" });
  await input.onProgress?.({ stage: "drafting", label: "Redactando el borrador", detail: "Organizando la información sin completar datos ausentes" });
  const professionalContent = professionalInstructions ? [{
    type: "input_text",
    text: `${PROFESSIONAL_INSTRUCTION_SOURCE.toUpperCase()} · source_index ${instructionSourceIndex} · page null:\n${professionalInstructions}\n\nEsta fuente define el alcance solicitado. Usa sus exclusiones como reglas y sus declaraciones textuales como contenido respaldado. Cita únicamente fragmentos literales de esta fuente; no cites como contenido las órdenes de edición.`,
  }] : [];
  const response = await (input.fetcher ?? fetch)("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: input.signal,
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      store: false,
      max_output_tokens: maxOutputTokens(input.model, input.target),
      ...(supportsReasoning(input.model) ? { reasoning: { effort: "low", summary: "auto" } } : {}),
      input: [
        { role: "system", content: systemPrompt(input.target, input.promptInstructions, input.promptMode) },
        {
          role: "user",
          content: [
            ...content,
            ...professionalContent,
            { type: "input_text", text: `Analiza las ${input.sources.length} fuentes documentales como un solo caso y prepara ${input.promptMode === "free" ? "exclusivamente el documento descrito en la indicación profesional" : `el borrador de tipo: ${input.target}`}. ${professionalInstructions ? `La fuente ${instructionSourceIndex} es la indicación profesional y manda sobre el alcance: no añadas contenido excluido o no solicitado.` : ""} Los marcadores HHR_PAGE_N representan páginas cuando existe texto extraído. En toda fuente PDF, incluso escaneada, usa el número de página real del PDF; reserva page null para DOCX, JSON, imágenes independientes y la indicación profesional.` },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "clinical_document_draft",
          strict: true,
          schema,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const failure = classifyOpenAiFailure(response.status, payload);
    const errorPayload = payload as OpenAiErrorPayload | null;
    console.error(JSON.stringify({
      level: "error",
      event: "openai_response_failed",
      status: response.status,
      code: failure.upstreamCode,
      type: safeOpenAiField(errorPayload?.error?.type),
      param: safeOpenAiField(errorPayload?.error?.param),
      upstreamRequestId: safeOpenAiField(response.headers.get("x-request-id")),
    }));
    throw failure;
  }

  const responsePayload = payload as OpenAiErrorPayload | null;
  const incompleteReason = safeOpenAiField(responsePayload?.incomplete_details?.reason);
  if (responsePayload?.status === "incomplete") {
    throw new OpenAiGenerationError({
      message: incompleteReason === "max_output_tokens"
        ? "OpenAI no alcanzó a completar el borrador. Reintente con el mismo archivo."
        : "OpenAI devolvió un borrador incompleto. Reintente con el mismo archivo.",
      publicCode: "AI_RESPONSE_INCOMPLETE",
      publicStatus: 502,
      upstreamStatus: response.status,
      upstreamCode: incompleteReason,
    });
  }
  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new OpenAiGenerationError({
      message: "OpenAI no devolvió un borrador utilizable.",
      publicCode: "AI_RESPONSE_EMPTY",
      publicStatus: 502,
      upstreamStatus: response.status,
    });
  }
  await input.onProgress?.({ stage: "verifying", label: "Verificando el borrador", detail: "Comprobando identidad, citas y campos pendientes" });
  const output = parseClinicalOutput(outputText, {
    target: input.target,
    promptMode: input.promptMode,
    sourceTexts: professionalInstructions ? [...sourceTexts, professionalInstructions] : sourceTexts,
    sourceMimeTypes: professionalInstructions ? [...input.sources.map((source) => source.mimeType), "text/plain"] : input.sources.map((source) => source.mimeType),
    sourcePageCounts: professionalInstructions ? [...sourcePageCounts, null] : sourcePageCounts,
  });
  const reasoningSummary = extractReasoningSummary(payload);
  return {
    output: reasoningSummary ? { ...output, reasoningSummary } : output,
    usage: extractAiTokenUsage(payload),
  };
}
