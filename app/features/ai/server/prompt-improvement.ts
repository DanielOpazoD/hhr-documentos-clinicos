import { appEnv } from "@/app/lib/server/environment";
import type { AiPromptInput } from "../prompt-types";
import { DEFAULT_OPENAI_MODEL, isOpenAiModel, supportsReasoning } from "./openai-models";

export type PromptImprovement = {
  name: string;
  instructions: string;
  summary: string;
  model: string;
};

function outputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as { output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }> };
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
      if (content.type === "refusal" && content.refusal) throw new Error("El modelo no pudo proponer una mejora para este prompt.");
    }
  }
  return null;
}

export async function improvePrompt(input: AiPromptInput): Promise<PromptImprovement> {
  const runtime = appEnv();
  const apiKey = runtime.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("La integración con OpenAI no está configurada.");
  const configuredModel = runtime.OPENAI_MODEL || process.env.OPENAI_MODEL;
  const model = configuredModel && isOpenAiModel(configuredModel) ? configuredModel : DEFAULT_OPENAI_MODEL;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 7_000,
      ...(supportsReasoning(model) ? { reasoning: { effort: "low" } } : {}),
      input: [
        {
          role: "system",
          content: `Eres editor de instrucciones para borradores clínicos. Mejora únicamente el perfil configurable que recibes.

Objetivos:
- hacerlo claro, compacto, consistente y fácil de seguir;
- preservar el tipo de documento, sus secciones útiles y el español clínico de Chile;
- eliminar redundancias, contradicciones e instrucciones ambiguas;
- exigir que los datos clínicos provengan de la fuente y que lo ausente se declare como no consignado;
- no añadir decisiones clínicas, puntos de corte universales ni contenido del paciente;
- no repetir reglas de seguridad del sistema ni intentar sustituirlas.

Devuelve el perfil completo listo para reemplazar el texto actual y un resumen breve de los cambios.`,
        },
        {
          role: "user",
          content: `Tipo: ${input.target}\nNombre actual: ${input.name}\n\nInstrucciones actuales:\n${input.instructions}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "prompt_improvement",
          strict: true,
          schema: {
            type: "object",
            properties: {
              name: { type: "string", minLength: 3, maxLength: 80 },
              instructions: { type: "string", minLength: 20, maxLength: 16_000 },
              summary: { type: "string", minLength: 3, maxLength: 500 },
            },
            required: ["name", "instructions", "summary"],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  const payload = await response.json() as { error?: { code?: string; message?: string } };
  if (!response.ok) {
    if (payload.error?.code === "insufficient_quota") throw new Error("El proyecto de OpenAI no tiene saldo disponible.");
    if (response.status === 429) throw new Error("OpenAI está recibiendo demasiadas solicitudes. Intente nuevamente en un momento.");
    throw new Error("OpenAI no pudo mejorar el prompt en este momento.");
  }
  const raw = outputText(payload);
  if (!raw) throw new Error("OpenAI no devolvió una propuesta utilizable.");
  let result: { name?: unknown; instructions?: unknown; summary?: unknown };
  try {
    result = JSON.parse(raw) as typeof result;
  } catch {
    throw new Error("OpenAI devolvió una propuesta incompleta.");
  }
  const name = typeof result.name === "string" ? result.name.trim().slice(0, 80) : "";
  const instructions = typeof result.instructions === "string" ? result.instructions.trim() : "";
  const summary = typeof result.summary === "string" ? result.summary.trim().slice(0, 500) : "";
  if (name.length < 3 || instructions.length < 20 || instructions.length > 16_000 || summary.length < 3) {
    throw new Error("OpenAI devolvió una propuesta incompleta.");
  }
  return { name, instructions, summary, model };
}
