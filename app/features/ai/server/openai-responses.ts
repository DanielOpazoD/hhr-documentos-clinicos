import { outputSchema, systemPrompt } from "./prompt";
import type { AiEvidence, AiPatient, AiProgressReporter, AiSigner, AiSourceInput, AiTargetId } from "../types";
import { parseClinicalOutput } from "./clinical-output";
import { extractLocalSource, getPdfPageCount } from "./source-extraction";
import type { AiTokenUsage } from "../usage-types";

export type OpenAiOutput = {
  documentKind: string;
  patient: AiPatient;
  signer: AiSigner;
  processingSummary: string;
  reasoningSummary?: string;
  sections: Array<{
    title: string;
    text: string;
    evidence: AiEvidence[];
  }>;
  missingInformation: string[];
  safetyNotice: string;
};

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

function extractTokenUsage(payload: unknown): AiTokenUsage {
  const usage = (payload as {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  } | null)?.usage;
  const inputTokens = Math.max(0, Number(usage?.input_tokens ?? 0));
  const outputTokens = Math.max(0, Number(usage?.output_tokens ?? 0));
  return {
    inputTokens,
    cachedInputTokens: Math.max(0, Number(usage?.input_tokens_details?.cached_tokens ?? 0)),
    outputTokens,
    totalTokens: Math.max(0, Number(usage?.total_tokens ?? inputTokens + outputTokens)),
  };
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
  promptInstructions: string;
  onProgress?: AiProgressReporter;
}): Promise<{ output: OpenAiOutput; usage: AiTokenUsage }> {
  await input.onProgress?.({ stage: "reading", label: "Leyendo documentos", detail: `Preparando ${input.sources.length} fuente${input.sources.length === 1 ? "" : "s"}` });
  const sourceTexts = await Promise.all(input.sources.map((source) =>
    extractLocalSource(source.file, source.mimeType).catch(() => null),
  ));
  const sourcePageCounts = await Promise.all(input.sources.map((source, index) =>
    source.mimeType === "application/pdf" && sourceTexts[index] === null
      ? getPdfPageCount(source.file).catch(() => null)
      : Promise.resolve(null),
  ));
  const content = (await Promise.all(input.sources.map(async (source, index) => {
    const original = await sourceContent(source.file, source.sourceName, source.mimeType);
    const extractedText = sourceTexts[index];
    const pageGuidance = source.mimeType === "application/pdf"
      ? ` Es un PDF${sourcePageCounts[index] ? ` de ${sourcePageCounts[index]} páginas` : ""}; cada cita debe indicar el número de página real del PDF.`
      : "";
    return [
      { type: "input_text", text: `FUENTE ${index + 1} · source_index ${index}: ${source.sourceName}.${pageGuidance}` },
      original,
      ...(extractedText !== null
        ? [{ type: "input_text", text: `TEXTO EXTRAÍDO PARA VERIFICACIÓN DE LA FUENTE ${index + 1}:\n${extractedText}` }]
        : []),
    ];
  }))).flat();
  await input.onProgress?.({ stage: "analyzing", label: "Identificando datos clínicos", detail: "Contrastando identidad, fechas y hallazgos entre las fuentes" });
  await input.onProgress?.({ stage: "drafting", label: "Redactando el borrador", detail: "Organizando la información sin completar datos ausentes" });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      store: false,
      max_output_tokens: 4000,
      reasoning: { effort: "low", summary: "auto" },
      input: [
        { role: "system", content: systemPrompt(input.target, input.promptInstructions) },
        {
          role: "user",
          content: [
            ...content,
            { type: "input_text", text: `Analiza las ${input.sources.length} fuentes como un solo caso y prepara el borrador de tipo: ${input.target}. Los marcadores HHR_PAGE_N representan páginas cuando existe texto extraído. En toda fuente PDF, incluso escaneada, usa el número de página real del PDF; reserva page null solo para DOCX e imágenes independientes.` },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "clinical_document_draft",
          strict: true,
          schema: outputSchema,
        },
      },
    }),
  });

  const payload = await response.json() as unknown;
  if (!response.ok) {
    const errorPayload = payload as { error?: { code?: string } };
    throw new Error(
      errorPayload.error?.code === "insufficient_quota"
        ? "El proyecto de OpenAI no tiene saldo disponible."
        : "OpenAI no pudo procesar el archivo.",
    );
  }

  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error("OpenAI no devolvió un borrador utilizable.");
  await input.onProgress?.({ stage: "verifying", label: "Verificando el borrador", detail: "Comprobando identidad, citas y campos pendientes" });
  const output = parseClinicalOutput(outputText, {
    sourceTexts,
    sourceMimeTypes: input.sources.map((source) => source.mimeType),
    sourcePageCounts,
  });
  const reasoningSummary = extractReasoningSummary(payload);
  return {
    output: reasoningSummary ? { ...output, reasoningSummary } : output,
    usage: extractTokenUsage(payload),
  };
}
