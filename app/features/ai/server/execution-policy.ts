import type { AiProviderId } from "../types";

export type AiOperation =
  | "clinical_draft"
  | "prompt_improvement"
  | "prompt_from_documents";

export type AiExecutionStatus = "active" | "completed" | "failed" | "timed_out" | "cancelled" | "expired";

export type AiExecutionPolicy = {
  cloudDailyLimit: number;
  cloudConcurrencyLimit: number;
  localConcurrencyLimit: number;
};

export type AiExecutionPolicySource = {
  AI_DAILY_CLOUD_LIMIT?: string;
  AI_MAX_CONCURRENT_CLOUD?: string;
  AI_MAX_CONCURRENT_LOCAL?: string;
};

const DEFAULT_POLICY: AiExecutionPolicy = {
  cloudDailyLimit: 40,
  cloudConcurrencyLimit: 2,
  localConcurrencyLimit: 1,
};

export const AI_CLOUD_WINDOW_MS = 24 * 60 * 60 * 1_000;
export const AI_ACTIVE_STALE_MS = 5 * 60 * 1_000;

function boundedInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

export function aiExecutionPolicy(source: AiExecutionPolicySource = {}): AiExecutionPolicy {
  return {
    cloudDailyLimit: boundedInteger(source.AI_DAILY_CLOUD_LIMIT, DEFAULT_POLICY.cloudDailyLimit, 1_000),
    cloudConcurrencyLimit: boundedInteger(source.AI_MAX_CONCURRENT_CLOUD, DEFAULT_POLICY.cloudConcurrencyLimit, 10),
    localConcurrencyLimit: boundedInteger(source.AI_MAX_CONCURRENT_LOCAL, DEFAULT_POLICY.localConcurrencyLimit, 5),
  };
}

export function aiOperationTimeoutMs(operation: AiOperation): number {
  return operation === "clinical_draft" ? 180_000 : 90_000;
}

export function aiProviderConcurrencyLimit(
  providerId: AiProviderId,
  policy: AiExecutionPolicy,
): number {
  return providerId === "openai"
    ? policy.cloudConcurrencyLimit
    : policy.localConcurrencyLimit;
}

export class AiExecutionTimeoutError extends Error {
  readonly code = "AI_PROVIDER_TIMEOUT";

  constructor() {
    super("La operación de IA tardó demasiado. Intente nuevamente con menos fuentes.");
    this.name = "AiExecutionTimeoutError";
  }
}

export class AiExecutionCancelledError extends Error {
  readonly code = "AI_EXECUTION_CANCELLED";

  constructor() {
    super("La operación de IA fue cancelada.");
    this.name = "AiExecutionCancelledError";
  }
}

export function aiExecutionFailureStatus(
  error: unknown,
): Exclude<AiExecutionStatus, "active" | "completed" | "expired"> {
  if (error instanceof AiExecutionCancelledError) return "cancelled";
  if (error instanceof AiExecutionTimeoutError) return "timed_out";
  return "failed";
}

export async function withAiExecutionTimeout<T>(
  action: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  if (externalSignal?.aborted) throw new AiExecutionCancelledError();
  const controller = new AbortController();
  let timedOut = false;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectCancellation: ((error: AiExecutionCancelledError) => void) | undefined;
  const cancel = () => {
    if (cancelled || timedOut) return;
    cancelled = true;
    controller.abort();
    rejectCancellation?.(new AiExecutionCancelledError());
  };
  externalSignal?.addEventListener("abort", cancel, { once: true });
  const cancellation = new Promise<never>((_, reject) => {
    rejectCancellation = reject;
  });
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new AiExecutionTimeoutError());
    }, timeoutMs);
  });
  try {
    const execution = Promise.resolve().then(() => {
      if (cancelled) throw new AiExecutionCancelledError();
      return action(controller.signal);
    });
    return await Promise.race([execution, timeout, cancellation]);
  } catch (error) {
    if (cancelled || error instanceof AiExecutionCancelledError) throw new AiExecutionCancelledError();
    if (timedOut || error instanceof AiExecutionTimeoutError) throw new AiExecutionTimeoutError();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    externalSignal?.removeEventListener("abort", cancel);
  }
}
