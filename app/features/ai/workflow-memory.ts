import type { AiPromptMode, AiTargetId } from "./types";

export const AI_WORKFLOW_MEMORY_KEY = "hhr.ai-workflow.v1";

export type AiWorkflowMemory = {
  version: 1;
  promptMode: AiPromptMode;
  target: AiTargetId;
  selectedPromptId: string;
};

const validTargets = new Set<AiTargetId>([
  "epicrisis",
  "traslado_agudo",
  "informe_medico",
  "certificado",
  "tele_gastro",
  "tele_nefro",
  "tele_reumato",
  "traslado_salvador",
]);

export function parseAiWorkflowMemory(raw: string | null): AiWorkflowMemory | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AiWorkflowMemory>;
    if (
      value.version !== 1
      || (value.promptMode !== "profile" && value.promptMode !== "free")
      || !value.target
      || !validTargets.has(value.target)
      || typeof value.selectedPromptId !== "string"
    ) return null;
    return {
      version: 1,
      promptMode: value.promptMode,
      target: value.target,
      selectedPromptId: value.selectedPromptId,
    };
  } catch {
    return null;
  }
}

export function serializeAiWorkflowMemory(input: Omit<AiWorkflowMemory, "version">): string {
  return JSON.stringify({ version: 1, ...input } satisfies AiWorkflowMemory);
}
