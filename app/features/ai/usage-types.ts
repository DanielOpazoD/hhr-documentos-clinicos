export type AiTokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AiUsageModelSummary = AiTokenUsage & {
  providerId: "openai" | "gemma_local";
  model: string;
  requests: number;
  estimatedCostUsd: number;
  unpricedRequests: number;
  lastUsedAt: string;
};

export type AiUsageSummary = {
  periodDays: number;
  availability: {
    cloud: {
      limit: number;
      used: number;
      remaining: number;
      nextAvailableAt: string | null;
    };
    concurrency: {
      cloud: { limit: number; active: number };
      local: { limit: number; active: number };
    };
  };
  totals: {
    requests: number;
    totalTokens: number;
    estimatedCostUsd: number;
    unpricedRequests: number;
  };
  models: AiUsageModelSummary[];
};
