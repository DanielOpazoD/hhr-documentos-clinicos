import type { AiPromptImprovement, AiPromptInput, AiPromptProfile, AiPromptProposal } from "./prompt-types";
import { readApiResponse } from "@/app/lib/client/http";

async function promptResponse(response: Response): Promise<{ prompts: AiPromptProfile[]; prompt?: AiPromptProfile }> {
  const data = await readApiResponse<{
    prompts?: AiPromptProfile[];
    prompt?: AiPromptProfile;
  }>(response, { fallbackMessage: "No se pudo leer la respuesta." });
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

export async function proposePromptProfileFromDocuments(ids: string[]): Promise<AiPromptProposal> {
  const response = await fetch("/api/ai/prompts/from-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const data = await readApiResponse<{
    proposal?: AiPromptInput;
    summary?: string;
  }>(response, { fallbackMessage: "No se pudo crear la propuesta." });
  if (!data.proposal || !data.summary) throw new Error("No se pudo crear la propuesta.");
  return { ...data.proposal, summary: data.summary };
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
  const data = await readApiResponse<{
    improvement?: AiPromptImprovement;
  }>(response, { fallbackMessage: "No se pudo mejorar el prompt." });
  if (!data.improvement) throw new Error("No se pudo mejorar el prompt.");
  return data.improvement;
}
