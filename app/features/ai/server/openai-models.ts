import type { AiModelGroup, AiModelOption } from "../types";

export const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

const FALLBACK_MODELS = [
  "gpt-5-mini",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "gpt-5.6-luna",
  "gpt-5",
  "gpt-5-nano",
  "o3",
  "o4-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
] as const;

const KNOWN_MODELS = new Map<string, Pick<AiModelOption, "name" | "detail" | "group" | "recommended">>([
  ["gpt-5-mini", { name: "GPT-5 mini", detail: "Rápido y eficiente", group: "Recomendados", recommended: true }],
  ["gpt-5.6-terra", { name: "GPT-5.6 Terra", detail: "Equilibrio entre calidad y costo", group: "Recomendados" }],
  ["gpt-5.6-sol", { name: "GPT-5.6 Sol", detail: "Mayor capacidad para casos complejos", group: "GPT-5.6" }],
  ["gpt-5.6-luna", { name: "GPT-5.6 Luna", detail: "Menor latencia para tareas breves", group: "GPT-5.6" }],
  ["gpt-5", { name: "GPT-5", detail: "Modelo general", group: "GPT-5" }],
  ["gpt-5-nano", { name: "GPT-5 nano", detail: "Rápido para tareas simples", group: "GPT-5" }],
  ["o3", { name: "o3", detail: "Razonamiento avanzado", group: "Razonamiento" }],
  ["o4-mini", { name: "o4-mini", detail: "Razonamiento rápido", group: "Razonamiento" }],
  ["gpt-4.1", { name: "GPT-4.1", detail: "Modelo multimodal", group: "GPT-4.1" }],
  ["gpt-4.1-mini", { name: "GPT-4.1 mini", detail: "Multimodal y eficiente", group: "GPT-4.1" }],
  ["gpt-4.1-nano", { name: "GPT-4.1 nano", detail: "Procesamiento ligero", group: "GPT-4.1" }],
  ["gpt-4o", { name: "GPT-4o", detail: "Modelo multimodal", group: "GPT-4o" }],
  ["gpt-4o-mini", { name: "GPT-4o mini", detail: "Multimodal y económico", group: "GPT-4o" }],
]);

const INCOMPATIBLE_VARIANTS = [
  "audio", "realtime", "transcribe", "tts", "image", "embedding", "moderation",
  "search", "deep-research", "codex", "chatgpt", "computer-use",
];

type ModelsCache = { expiresAt: number; models: AiModelOption[] };
let modelsCache: ModelsCache | null = null;

function baseModelId(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.startsWith("ft:") ? normalized.slice(3).split(":")[0] : normalized;
}

export function isOpenAiModel(value: string): boolean {
  if (!value || value.length > 160 || !/^[a-z0-9._:-]+$/i.test(value)) return false;
  const normalized = value.toLowerCase();
  const base = baseModelId(normalized);
  if (INCOMPATIBLE_VARIANTS.some((variant) => base.includes(variant)) || base.startsWith("o3-mini")) return false;
  return /^(?:gpt-(?:5(?:\.\d+)?|4\.1|4o)(?:-|$)|o(?:3|4)(?:-|$))/.test(base);
}

export function supportsReasoning(model: string): boolean {
  const base = baseModelId(model.toLowerCase());
  return base.startsWith("gpt-5") || /^o(?:3|4)(?:-|$)/.test(base);
}

function groupFor(id: string): AiModelGroup {
  if (id.startsWith("ft:")) return "Personalizados";
  const base = baseModelId(id);
  if (base.startsWith("gpt-5.6")) return "GPT-5.6";
  if (base.startsWith("gpt-5")) return "GPT-5";
  if (/^o(?:3|4)(?:-|$)/.test(base)) return "Razonamiento";
  if (base.startsWith("gpt-4.1")) return "GPT-4.1";
  if (base.startsWith("gpt-4o")) return "GPT-4o";
  return "Otros";
}

function readableName(id: string): string {
  if (id.startsWith("ft:")) return id.split(":").slice(2).join(":") || id;
  return id
    .replace(/^gpt-/, "GPT-")
    .replace(/-mini\b/, " mini")
    .replace(/-nano\b/, " nano")
    .replace(/-sol\b/, " Sol")
    .replace(/-terra\b/, " Terra")
    .replace(/-luna\b/, " Luna");
}

function modelOption(id: string): AiModelOption {
  const known = KNOWN_MODELS.get(id);
  if (known) return { id, ...known };
  return {
    id,
    name: readableName(id),
    detail: id.startsWith("ft:") ? "Modelo personalizado de la cuenta" : "Disponible en la cuenta",
    group: groupFor(id),
  };
}

function sortModels(models: AiModelOption[]): AiModelOption[] {
  const groups: AiModelGroup[] = ["Recomendados", "GPT-5.6", "GPT-5", "Razonamiento", "GPT-4.1", "GPT-4o", "Personalizados", "Otros", "Local"];
  const priority = new Map(FALLBACK_MODELS.map((id, index) => [id, index]));
  return models.toSorted((left, right) => {
    const groupOrder = groups.indexOf(left.group) - groups.indexOf(right.group);
    if (groupOrder) return groupOrder;
    const leftPriority = priority.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = priority.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftPriority - rightPriority || left.name.localeCompare(right.name, "es");
  });
}

function uniqueModels(ids: string[]): AiModelOption[] {
  return sortModels([...new Set(ids)].filter(isOpenAiModel).map(modelOption));
}

export function fallbackOpenAiModels(): AiModelOption[] {
  return uniqueModels([...FALLBACK_MODELS]);
}

export async function listOpenAiModels(apiKey?: string): Promise<AiModelOption[]> {
  if (!apiKey) return fallbackOpenAiModels();
  if (modelsCache && modelsCache.expiresAt > Date.now()) return modelsCache.models;
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error("models_unavailable");
    const payload = await response.json() as { data?: Array<{ id?: string }> };
    const ids = (payload.data ?? []).flatMap((item) => typeof item.id === "string" ? [item.id] : []);
    const models = uniqueModels(ids);
    if (!models.length) throw new Error("models_empty");
    modelsCache = { expiresAt: Date.now() + 10 * 60 * 1000, models };
    return models;
  } catch {
    return fallbackOpenAiModels();
  }
}
