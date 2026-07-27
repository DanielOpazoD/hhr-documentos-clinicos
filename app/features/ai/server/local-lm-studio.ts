import { parseClinicalOutput } from "./clinical-output";
import { outputSchema, systemPrompt } from "./prompt";
import { extractLocalSource } from "./source-extraction";
import type { OpenAiOutput } from "./openai-responses";
import type { AiProgressReporter, AiSourceInput, AiTargetId } from "../types";
import type { AiTokenUsage } from "../usage-types";

const LOCAL_CONTEXT_TOKENS = 16_384;
const LOCAL_OUTPUT_TOKENS = 3_800;
const LOCAL_IMAGE_TOKEN_RESERVE = 1_600;
const LOCAL_SAFETY_MARGIN_TOKENS = 768;
const CONSERVATIVE_CHARACTERS_PER_TOKEN = 3.2;

function localOutputTokens(target: AiTargetId): number {
  return target === "traslado_salvador" ? 5_500 : LOCAL_OUTPUT_TOKENS;
}

function requestInstructions(target: AiTargetId) {
  const absentFields = target === "traslado_salvador"
    ? 'Incluye exactamente los 18 campos; cuando falte un dato, usa "No consignado" y evidence vacío.'
    : "No crees secciones para datos ausentes.";
  return `Prepara el borrador de tipo ${target} integrando todas las fuentes. Responde exclusivamente con el JSON solicitado. Los marcadores HHR_PAGE_N delimitan páginas; usa el índice indicado para source_index y no reproduzcas marcadores internos. Usa page null en DOCX e imágenes, y un número solamente cuando exista un marcador HHR_PAGE_N. ${absentFields}`;
}

function estimatedRequestTokens(
  sources: Array<AiSourceInput & { extractedText: string | null }>,
  target: AiTargetId,
  promptInstructions: string,
) {
  const schema = outputSchema(target);
  const textCharacters = systemPrompt(target, promptInstructions).length
    + JSON.stringify(schema).length
    + requestInstructions(target).length
    + sources.reduce((total, source, index) => total
      + `FUENTE ${index + 1} · source_index ${index}: ${source.sourceName}`.length
      + (source.extractedText?.length ?? 0), 0);
  const imageCount = sources.filter((source) => source.extractedText === null).length;
  return Math.ceil(textCharacters / CONSERVATIVE_CHARACTERS_PER_TOKEN)
    + imageCount * LOCAL_IMAGE_TOKEN_RESERVE
    + localOutputTokens(target)
    + LOCAL_SAFETY_MARGIN_TOKENS;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)));
  }
  return btoa(chunks.join(""));
}

async function messageContent(
  sources: Array<AiSourceInput & { extractedText: string | null }>,
  target: AiTargetId,
) {
  const content: Array<Record<string, unknown>> = [{
    type: "text",
    text: requestInstructions(target),
  }];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    content.push({ type: "text", text: `FUENTE ${index + 1} · source_index ${index}: ${source.sourceName}` });
    if (source.extractedText !== null) {
      content.push({ type: "text", text: source.extractedText });
    } else {
      const buffer = await source.file.arrayBuffer();
      content.push({ type: "image_url", image_url: { url: `data:${source.mimeType};base64,${toBase64(buffer)}` } });
    }
  }
  return content;
}

export async function generateLocalClinicalDraft(input: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  sources: AiSourceInput[];
  target: AiTargetId;
  promptInstructions: string;
  onProgress?: AiProgressReporter;
}): Promise<{ output: OpenAiOutput; usage: AiTokenUsage }> {
  await input.onProgress?.({ stage: "reading", label: "Leyendo documentos", detail: `Extrayendo texto e imágenes de ${input.sources.length} fuente${input.sources.length === 1 ? "" : "s"}` });
  const sources: Array<AiSourceInput & { extractedText: string | null }> = [];
  for (const source of input.sources) {
    const extractedText = await extractLocalSource(source.file, source.mimeType);
    sources.push({ ...source, extractedText });
  }
  if (estimatedRequestTokens(sources, input.target, input.promptInstructions) > LOCAL_CONTEXT_TOKENS) {
    throw new Error("El conjunto de documentos supera el contexto seguro de Gemma local. Reduzca la cantidad o use OpenAI.");
  }
  const content = await messageContent(sources, input.target);
  const schema = outputSchema(input.target);
  await input.onProgress?.({ stage: "analyzing", label: "Identificando datos clínicos", detail: "Contrastando identidad, fechas y hallazgos entre las fuentes" });
  await input.onProgress?.({ stage: "drafting", label: "Redactando el borrador", detail: "Organizando la información sin completar datos ausentes" });
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: {
      "Content-Type": "application/json",
      ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.1,
      max_tokens: localOutputTokens(input.target),
      messages: [
        { role: "system", content: systemPrompt(input.target, input.promptInstructions) },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "clinical_document_draft", strict: true, schema },
      },
    }),
  });
  const payload = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message ? "Gemma local no pudo procesar el archivo." : "No se pudo conectar con Gemma local.");
  }
  const contentText = payload?.choices?.[0]?.message?.content;
  if (!contentText) throw new Error("Gemma local no devolvió un borrador utilizable.");
  await input.onProgress?.({ stage: "verifying", label: "Verificando el borrador", detail: "Comprobando identidad, citas y campos pendientes" });
  const inputTokens = Math.max(0, Number(payload?.usage?.prompt_tokens ?? 0));
  const outputTokens = Math.max(0, Number(payload?.usage?.completion_tokens ?? 0));
  return {
    output: parseClinicalOutput(contentText, {
      target: input.target,
      sourceTexts: sources.map((source) => source.extractedText),
      sourceMimeTypes: sources.map((source) => source.mimeType),
    }),
    usage: {
      inputTokens,
      cachedInputTokens: 0,
      outputTokens,
      totalTokens: Math.max(0, Number(payload?.usage?.total_tokens ?? inputTokens + outputTokens)),
    },
  };
}
