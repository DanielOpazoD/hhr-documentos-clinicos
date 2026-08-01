import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { jsonError, observeApi } from "@/app/lib/server/http";

type UsageRow = {
  providerId: "openai" | "gemma_local";
  model: string;
  requests: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostMicrousd: number;
  unpricedRequests: number;
  lastUsedAt: string;
};

async function getUsage(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const requestedDays = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const periodDays = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const since = new Date(Date.now() - periodDays * 86_400_000).toISOString();
  const db = await ensureDatabase();
  const result = await db.prepare(`
    SELECT
      provider_id AS providerId,
      model,
      COUNT(*) AS requests,
      COALESCE(SUM(input_tokens), 0) AS inputTokens,
      COALESCE(SUM(cached_input_tokens), 0) AS cachedInputTokens,
      COALESCE(SUM(output_tokens), 0) AS outputTokens,
      COALESCE(SUM(total_tokens), 0) AS totalTokens,
      COALESCE(SUM(estimated_cost_microusd), 0) AS estimatedCostMicrousd,
      SUM(CASE WHEN estimated_cost_microusd IS NULL THEN 1 ELSE 0 END) AS unpricedRequests,
      MAX(created_at) AS lastUsedAt
    FROM ai_usage_events
    WHERE owner_email = ? AND created_at >= ?
    GROUP BY provider_id, model
    ORDER BY lastUsedAt DESC
  `).bind(owner, since).all<UsageRow>();
  const models = result.results.map((row) => ({
    ...row,
    estimatedCostUsd: row.estimatedCostMicrousd / 1_000_000,
  }));
  return Response.json({
    periodDays,
    totals: models.reduce((totals, row) => ({
      requests: totals.requests + row.requests,
      totalTokens: totals.totalTokens + row.totalTokens,
      estimatedCostUsd: totals.estimatedCostUsd + row.estimatedCostUsd,
      unpricedRequests: totals.unpricedRequests + row.unpricedRequests,
    }), { requests: 0, totalTokens: 0, estimatedCostUsd: 0, unpricedRequests: 0 }),
    models,
  });
}

export const GET = observeApi("ai.usage.GET", getUsage);
