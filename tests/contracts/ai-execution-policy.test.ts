import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_ACTIVE_STALE_MS,
  AI_CLOUD_WINDOW_MS,
  AiExecutionCancelledError,
  aiExecutionFailureStatus,
  aiExecutionPolicy,
  aiOperationTimeoutMs,
  aiProviderConcurrencyLimit,
  AiExecutionTimeoutError,
  withAiExecutionTimeout,
} from "../../app/features/ai/server/execution-policy.ts";
import { extractAiTokenUsage } from "../../app/features/ai/server/token-usage.ts";

test("uses bounded operational defaults for AI execution", () => {
  const defaults = aiExecutionPolicy();
  assert.deepEqual(defaults, {
    cloudDailyLimit: 40,
    cloudConcurrencyLimit: 2,
    localConcurrencyLimit: 1,
  });
  assert.equal(AI_CLOUD_WINDOW_MS, 24 * 60 * 60 * 1_000);
  assert.equal(AI_ACTIVE_STALE_MS > aiOperationTimeoutMs("clinical_draft"), true);
  assert.equal(aiOperationTimeoutMs("prompt_improvement"), 90_000);
  assert.equal(aiOperationTimeoutMs("prompt_from_documents"), 90_000);
  assert.equal(aiOperationTimeoutMs("clinical_draft"), 180_000);
});

test("accepts safe limit overrides and rejects disabled or excessive values", () => {
  assert.deepEqual(aiExecutionPolicy({
    AI_DAILY_CLOUD_LIMIT: "75",
    AI_MAX_CONCURRENT_CLOUD: "4",
    AI_MAX_CONCURRENT_LOCAL: "2",
  }), {
    cloudDailyLimit: 75,
    cloudConcurrencyLimit: 4,
    localConcurrencyLimit: 2,
  });
  assert.deepEqual(aiExecutionPolicy({
    AI_DAILY_CLOUD_LIMIT: "0",
    AI_MAX_CONCURRENT_CLOUD: "999",
    AI_MAX_CONCURRENT_LOCAL: "not-a-number",
  }), aiExecutionPolicy());
});

test("separates cloud and local concurrency without making local work consume cloud quota", () => {
  const policy = aiExecutionPolicy();
  assert.equal(aiProviderConcurrencyLimit("openai", policy), 2);
  assert.equal(aiProviderConcurrencyLimit("gemma_local", policy), 1);
});

test("aborts slow provider work with a stable private timeout error", async () => {
  let observedAbort = false;
  await assert.rejects(
    () => withAiExecutionTimeout(async (signal) => {
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          observedAbort = true;
          resolve();
        }, { once: true });
      });
      throw new Error("raw provider detail");
    }, 5),
    (error: unknown) => {
      assert.ok(error instanceof AiExecutionTimeoutError);
      assert.equal(error.code, "AI_PROVIDER_TIMEOUT");
      assert.doesNotMatch(error.message, /raw provider detail/);
      return true;
    },
  );
  assert.equal(observedAbort, true);
});

test("preserves non-timeout failures for the route-specific safe mapper", async () => {
  const providerError = new Error("provider-safe-error");
  await assert.rejects(
    () => withAiExecutionTimeout(async () => { throw providerError; }, 100),
    (error: unknown) => error === providerError,
  );
});

test("cancels provider work through an external signal without turning it into a timeout", async () => {
  const controller = new AbortController();
  let observedAbort = false;
  let notifyStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
  const operation = withAiExecutionTimeout(async (signal) => {
    notifyStarted?.();
    await new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => {
        observedAbort = true;
        resolve();
      }, { once: true });
    });
    throw new Error("provider detail after cancellation");
  }, 1_000, controller.signal);

  await started;
  controller.abort();

  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof AiExecutionCancelledError);
    assert.equal(error.code, "AI_EXECUTION_CANCELLED");
    assert.doesNotMatch(error.message, /provider detail/);
    return true;
  });
  assert.equal(observedAbort, true);
  assert.equal(aiExecutionFailureStatus(new AiExecutionCancelledError()), "cancelled");
  assert.equal(aiExecutionFailureStatus(new AiExecutionTimeoutError()), "timed_out");
  assert.equal(aiExecutionFailureStatus(new Error("provider")), "failed");
});

test("does not start provider work when the request is already cancelled", async () => {
  const controller = new AbortController();
  controller.abort();
  let started = false;

  await assert.rejects(
    () => withAiExecutionTimeout(async () => {
      started = true;
      return "unexpected";
    }, 1_000, controller.signal),
    (error: unknown) => error instanceof AiExecutionCancelledError,
  );
  assert.equal(started, false);
});

test("normalizes provider usage without negative, cached or malformed token inflation", () => {
  assert.deepEqual(extractAiTokenUsage({
    usage: {
      input_tokens: 120.9,
      output_tokens: 30,
      total_tokens: 140,
      input_tokens_details: { cached_tokens: 999 },
    },
  }), {
    inputTokens: 120,
    cachedInputTokens: 120,
    outputTokens: 30,
    totalTokens: 150,
  });
  assert.deepEqual(extractAiTokenUsage({
    usage: { input_tokens: "invalid", output_tokens: -4, total_tokens: Infinity },
  }), {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  });
});
