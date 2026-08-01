import { appEnv } from "@/app/lib/server/environment";
import type { AiTargetId } from "../types";
import { DEFAULT_OPENAI_MODEL, isOpenAiModel, supportsReasoning } from "./openai-models";
import { assertProposalIsGeneric, compactDocuments, type PromptSourceDocument } from "./prompt-source-policy";
import type { AiTokenUsage } from "../usage-types";
import { extractAiTokenUsage } from "./token-usage";

export type { PromptSourceDocument } from "./prompt-source-policy";

export type DocumentPromptProposal = {
  name: string;
  target: AiTargetId;
  instructions: string;
  summary: string;
  model: string;
  usage: AiTokenUsage;
};

function outputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as { output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }> };
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
      if (content.type === "refusal" && content.refusal) throw new Error("El modelo no pudo crear una plantilla desde estos documentos.");
    }
  }
  return null;
}

export async function createPromptFromDocuments(
  documents: PromptSourceDocument[],
  options: { signal?: AbortSignal } = {},
): Promise<DocumentPromptProposal> {
  const runtime = appEnv();
  const apiKey = runtime.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("La integración con OpenAI no está configurada.");
  const configuredModel = runtime.OPENAI_MODEL || process.env.OPENAI_MODEL;
  const model = configuredModel && isOpenAiModel(configuredModel) ? configuredModel : DEFAULT_OPENAI_MODEL;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: options.signal,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 7_000,
      ...(supportsReasoning(model) ? { reasoning: { effort: "low" } } : {}),
      input: [
        {
          role: "system",
          content: `Eres diseñador de plantillas reutilizables para documentos clínicos en español de Chile. A partir de uno o varios ejemplos, crea un perfil de generación claro y compacto.

Reglas:
- recibes exclusivamente metadatos estructurales anonimizados: tipo de plantilla, orden, extensión y cantidad de párrafos; no se incluye texto clínico;
- extrae propósito, estructura, orden y nivel de detalle comunes sin inventar contenido ni nombres de secciones que la estructura no permite inferir;
- nunca copies nombres, RUT, fechas, resultados, diagnósticos ni otras circunstancias identificables de los ejemplos;
- describe campos y secciones como instrucciones genéricas, no como contenido de un paciente;
- si los ejemplos difieren, conserva solo el patrón reutilizable y evita fusionar tipos incompatibles;
- exige respetar las inclusiones y exclusiones que el profesional escriba al generar cada borrador;
- exige usar únicamente los archivos y la indicación profesional como fuentes, declarando "No consignado" cuando falte respaldo;
- no repitas reglas de seguridad internas ni agregues decisiones clínicas.

Elige el target que mejor represente la plantilla y devuelve instrucciones completas listas para reutilizar.`,
        },
        {
          role: "user",
          content: `Documentos seleccionados (${documents.length}):\n${compactDocuments(documents)}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "document_prompt_profile",
          strict: true,
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              target: { type: "string", enum: ["epicrisis", "traslado_agudo", "informe_medico", "certificado", "tele_gastro", "tele_nefro", "tele_reumato", "traslado_salvador"] },
              instructions: { type: "string" },
              summary: { type: "string" },
            },
            required: ["name", "target", "instructions", "summary"],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  const payload = await response.json() as { error?: { code?: string } };
  if (!response.ok) {
    if (payload.error?.code === "insufficient_quota") throw new Error("El proyecto de OpenAI no tiene saldo disponible.");
    if (response.status === 429) throw new Error("OpenAI está recibiendo demasiadas solicitudes. Intente nuevamente en un momento.");
    throw new Error("OpenAI no pudo crear la plantilla en este momento.");
  }
  const raw = outputText(payload);
  if (!raw) throw new Error("OpenAI no devolvió una plantilla utilizable.");
  let result: { name?: unknown; target?: unknown; instructions?: unknown; summary?: unknown };
  try { result = JSON.parse(raw) as typeof result; } catch { throw new Error("OpenAI devolvió una plantilla incompleta."); }
  const targets: AiTargetId[] = ["epicrisis", "traslado_agudo", "informe_medico", "certificado", "tele_gastro", "tele_nefro", "tele_reumato", "traslado_salvador"];
  const name = typeof result.name === "string" ? result.name.trim().slice(0, 80) : "";
  const target = targets.includes(result.target as AiTargetId) ? result.target as AiTargetId : null;
  const instructions = typeof result.instructions === "string" ? result.instructions.trim() : "";
  const summary = typeof result.summary === "string" ? result.summary.trim().slice(0, 500) : "";
  if (name.length < 3 || !target || instructions.length < 20 || instructions.length > 16_000 || summary.length < 3) {
    throw new Error("OpenAI devolvió una plantilla incompleta.");
  }
  const proposal = { name, target, instructions, summary, model, usage: extractAiTokenUsage(payload) };
  assertProposalIsGeneric(proposal);
  return proposal;
}
