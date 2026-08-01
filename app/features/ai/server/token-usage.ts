import type { AiTokenUsage } from "../usage-types";

function tokenCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function extractAiTokenUsage(payload: unknown): AiTokenUsage {
  const usage = (payload as {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  } | null)?.usage;
  const inputTokens = tokenCount(usage?.input_tokens);
  const outputTokens = tokenCount(usage?.output_tokens);
  return {
    inputTokens,
    cachedInputTokens: Math.min(
      inputTokens,
      tokenCount(usage?.input_tokens_details?.cached_tokens),
    ),
    outputTokens,
    totalTokens: Math.max(inputTokens + outputTokens, tokenCount(usage?.total_tokens)),
  };
}
