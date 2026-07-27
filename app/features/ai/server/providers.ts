import { appEnv } from "@/app/lib/server/environment";
import type { AiProgressReporter, AiProviderId, AiProviderInfo, AiSourceInput, AiTargetId } from "../types";
import type { OpenAiOutput } from "./openai-responses";
import { generateClinicalDraft } from "./openai-responses";
import { generateLocalClinicalDraft } from "./local-lm-studio";
import type { AiTokenUsage } from "../usage-types";

const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const DEFAULT_LOCAL_MODEL = "hhr-gemma-local";
const DEVELOPMENT_LOCAL_URL = "http://127.0.0.1:1234/v1";
const OPENAI_MODELS = [
  { id: "gpt-5-mini", name: "GPT-5 mini", detail: "Rápido y eficiente · predeterminado" },
  { id: "gpt-5.6-terra", name: "GPT-5.6 Terra", detail: "Equilibrio entre calidad y costo" },
  { id: "gpt-5.6-sol", name: "GPT-5.6 Sol", detail: "Mayor capacidad para casos complejos" },
] as const;

type ProviderConfig = {
  id: AiProviderId;
  name: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  execution?: "local" | "remote";
};

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname))) {
    throw new Error("El servidor local debe usar HTTPS o ejecutarse en este equipo.");
  }
  return url.toString().replace(/\/$/, "");
}

export function isAiProviderId(value: string): value is AiProviderId {
  return value === "openai" || value === "gemma_local";
}

export function isOpenAiModel(value: string): boolean {
  return OPENAI_MODELS.some((model) => model.id === value);
}

function providerConfig(id: AiProviderId, requestedModel?: string): ProviderConfig {
  const runtime = appEnv();
  if (id === "openai") {
    return {
      id,
      name: "OpenAI",
      model: requestedModel && isOpenAiModel(requestedModel) ? requestedModel : DEFAULT_OPENAI_MODEL,
      apiKey: runtime.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    };
  }
  const configuredUrl = runtime.LOCAL_AI_BASE_URL || process.env.LOCAL_AI_BASE_URL;
  const baseUrl = configuredUrl || (process.env.NODE_ENV !== "production" ? DEVELOPMENT_LOCAL_URL : undefined);
  const normalizedBaseUrl = baseUrl ? normalizeBaseUrl(baseUrl) : undefined;
  const execution = !normalizedBaseUrl || isLoopback(new URL(normalizedBaseUrl).hostname) ? "local" : "remote";
  return {
    id,
    name: execution === "local" ? "Gemma local" : "Gemma remota",
    model: runtime.LOCAL_AI_MODEL || process.env.LOCAL_AI_MODEL || DEFAULT_LOCAL_MODEL,
    apiKey: runtime.LOCAL_AI_API_KEY || process.env.LOCAL_AI_API_KEY,
    baseUrl: normalizedBaseUrl,
    execution,
  };
}

async function localProviderInfo(config: ProviderConfig): Promise<AiProviderInfo> {
  const local = config.execution === "local";
  const location = local ? "Este Mac" : "Servidor externo";
  if (!config.baseUrl) {
    return { id: config.id, name: config.name, model: config.model, models: [{ id: config.model, name: config.model, detail: "Modelo configurado en este equipo" }], location, available: false, detail: "Servidor no configurado" };
  }
  if (!local && !config.apiKey) {
    return { id: config.id, name: config.name, model: config.model, models: [{ id: config.model, name: config.model, detail: "Modelo configurado en este equipo" }], location, available: false, detail: "Falta autenticación del gateway" };
  }
  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      signal: AbortSignal.timeout(1_800),
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
    });
    if (!response.ok) throw new Error("unavailable");
    const payload = await response.json() as { data?: Array<{ id?: string }> };
    const modelReady = payload.data?.some((model) => model.id === config.model) ?? false;
    return {
      id: config.id,
      name: config.name,
      model: config.model,
      models: [{ id: config.model, name: config.model, detail: "Modelo configurado en este equipo" }],
      location,
      available: modelReady,
      detail: modelReady
        ? local ? "Privado · sin salir del equipo" : "Gateway HTTPS configurado"
        : "Modelo no cargado",
    };
  } catch {
    return { id: config.id, name: config.name, model: config.model, models: [{ id: config.model, name: config.model, detail: "Modelo configurado en este equipo" }], location, available: false, detail: local ? "Inicie LM Studio para usarlo" : "Gateway no disponible" };
  }
}

export async function getAiProviders(): Promise<AiProviderInfo[]> {
  const openai = providerConfig("openai");
  let localInfo: AiProviderInfo;
  try {
    localInfo = await localProviderInfo(providerConfig("gemma_local"));
  } catch {
    const runtime = appEnv();
    localInfo = {
      id: "gemma_local",
      name: "Gemma local",
      model: runtime.LOCAL_AI_MODEL || process.env.LOCAL_AI_MODEL || DEFAULT_LOCAL_MODEL,
      models: [{ id: runtime.LOCAL_AI_MODEL || process.env.LOCAL_AI_MODEL || DEFAULT_LOCAL_MODEL, name: runtime.LOCAL_AI_MODEL || process.env.LOCAL_AI_MODEL || DEFAULT_LOCAL_MODEL, detail: "Modelo configurado en este equipo" }],
      location: "Este Mac",
      available: false,
      detail: "Configuración local inválida",
    };
  }
  return [
    {
      id: openai.id,
      name: openai.name,
      model: openai.model,
      models: [...OPENAI_MODELS],
      location: "Nube",
      available: Boolean(openai.apiKey),
      detail: openai.apiKey ? "PDF, DOCX e imágenes" : "API no configurada",
    },
    localInfo,
  ];
}

export async function generateDraftWithProvider(input: {
  providerId: AiProviderId;
  model?: string;
  sources: AiSourceInput[];
  target: AiTargetId;
  promptInstructions: string;
  onProgress?: AiProgressReporter;
}): Promise<{ output: OpenAiOutput; provider: ProviderConfig; usage: AiTokenUsage }> {
  if (input.providerId === "openai" && input.model && !isOpenAiModel(input.model)) {
    throw new Error("Modelo de OpenAI no permitido.");
  }
  const provider = providerConfig(input.providerId, input.model);
  if (provider.id === "openai") {
    if (!provider.apiKey) throw new Error("La integración con OpenAI no está configurada.");
    const result = await generateClinicalDraft({
      apiKey: provider.apiKey,
      model: provider.model,
      sources: input.sources,
      target: input.target,
      promptInstructions: input.promptInstructions,
      onProgress: input.onProgress,
    });
    return { ...result, provider };
  }
  if (!provider.baseUrl) throw new Error("Gemma local no está configurada en este equipo.");
  if (provider.execution === "remote" && !provider.apiKey) {
    throw new Error("El gateway privado requiere autenticación.");
  }
  const result = await generateLocalClinicalDraft({
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: provider.model,
    sources: input.sources,
    target: input.target,
    promptInstructions: input.promptInstructions,
    onProgress: input.onProgress,
  });
  return { ...result, provider };
}
