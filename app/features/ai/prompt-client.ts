import type { AiPromptImprovement, AiPromptInput, AiPromptProfile } from "./prompt-types";

async function promptResponse(response: Response): Promise<{ prompts: AiPromptProfile[]; prompt?: AiPromptProfile }> {
  const data = await response.json().catch(() => ({ error: "No se pudo leer la respuesta." })) as {
    prompts?: AiPromptProfile[];
    prompt?: AiPromptProfile;
    error?: string;
  };
  if (!response.ok) throw new Error(data.error ?? "No se pudo completar la operación.");
  return { prompts: data.prompts ?? [], prompt: data.prompt };
}

export async function fetchPromptProfiles(): Promise<AiPromptProfile[]> {
  const response = await fetch("/api/ai/prompts", { cache: "no-store" });
  return (await promptResponse(response)).prompts;
}

export async function createPromptProfile(input: AiPromptInput) {
  return promptResponse(await fetch("/api/ai/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

export async function updatePromptProfile(id: string, input: AiPromptInput) {
  return promptResponse(await fetch(`/api/ai/prompts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
}

export async function deletePromptProfile(id: string) {
  return promptResponse(await fetch(`/api/ai/prompts/${id}`, { method: "DELETE" }));
}

export async function improvePromptProfile(input: AiPromptInput): Promise<AiPromptImprovement> {
  const response = await fetch("/api/ai/prompts/improve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({ error: "No se pudo leer la respuesta." })) as {
    improvement?: AiPromptImprovement;
    error?: string;
  };
  if (!response.ok || !data.improvement) throw new Error(data.error ?? "No se pudo mejorar el prompt.");
  return data.improvement;
}
