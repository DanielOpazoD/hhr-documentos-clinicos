import { ensureDatabase } from "@/app/lib/server/database";
import type { AiProviderId } from "../types";
import type { AiTokenUsage } from "../usage-types";

type Price = { input: number; cached: number; output: number; longContext?: boolean };

const OPENAI_PRICES: Array<{ matches: (model: string) => boolean; price: Price }> = [
  { matches: (model) => model === "gpt-5.6" || model.startsWith("gpt-5.6-sol"), price: { input: 5, cached: .5, output: 30, longContext: true } },
  { matches: (model) => model.startsWith("gpt-5.6-terra"), price: { input: 2.5, cached: .25, output: 15, longContext: true } },
  { matches: (model) => model.startsWith("gpt-5.6-luna"), price: { input: 1, cached: .1, output: 6, longContext: true } },
  { matches: (model) => model.startsWith("gpt-5.4-mini"), price: { input: .75, cached: .075, output: 4.5 } },
  { matches: (model) => model.startsWith("gpt-5.4-nano"), price: { input: .2, cached: .02, output: 1.25 } },
  { matches: (model) => model.startsWith("gpt-5-mini"), price: { input: .25, cached: .025, output: 2 } },
  { matches: (model) => model === "gpt-5" || /^gpt-5-20/.test(model), price: { input: 1.25, cached: .125, output: 10 } },
];

function estimatedCostMicrousd(providerId: AiProviderId, model: string, usage: AiTokenUsage): number | null {
  if (providerId === "gemma_local") return 0;
  const price = OPENAI_PRICES.find((item) => item.matches(model))?.price;
  if (!price) return null;
  const cached = Math.min(usage.inputTokens, usage.cachedInputTokens);
  const uncached = Math.max(0, usage.inputTokens - cached);
  const longContext = Boolean(price.longContext && usage.inputTokens > 272_000);
  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplier = longContext ? 1.5 : 1;
  return Math.round(
    uncached * price.input * inputMultiplier
    + cached * price.cached * inputMultiplier
    + usage.outputTokens * price.output * outputMultiplier,
  );
}

export async function recordAiUsage(input: {
  owner: string;
  runId: string;
  providerId: AiProviderId;
  model: string;
  usage: AiTokenUsage;
}) {
  const db = await ensureDatabase();
  const estimatedCost = estimatedCostMicrousd(input.providerId, input.model, input.usage);
  await db.prepare(`
    INSERT INTO ai_usage_events (
      id, owner_email, run_id, provider_id, model, input_tokens,
      cached_input_tokens, output_tokens, total_tokens,
      estimated_cost_microusd, pricing_source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), input.owner, input.runId, input.providerId, input.model,
    input.usage.inputTokens, input.usage.cachedInputTokens, input.usage.outputTokens,
    input.usage.totalTokens, estimatedCost,
    input.providerId === "gemma_local" ? "local" : estimatedCost === null ? "unavailable" : "openai-2026-07-26",
    new Date().toISOString(),
  ).run();
}
