import { ensureDatabase } from "@/app/lib/server/database";
import { appEnv } from "@/app/lib/server/environment";
import { jsonError } from "@/app/lib/server/http";
import type { AiProviderId } from "../types";
import type { AiUsageSummary } from "../usage-types";
import {
  AI_ACTIVE_STALE_MS,
  AI_CLOUD_WINDOW_MS,
  aiExecutionFailureStatus,
  aiExecutionPolicy,
  aiOperationTimeoutMs,
  aiProviderConcurrencyLimit,
  withAiExecutionTimeout,
  type AiExecutionPolicy,
  type AiExecutionStatus,
  type AiOperation,
} from "./execution-policy";

export { AiExecutionCancelledError, AiExecutionTimeoutError } from "./execution-policy";

export type AiExecutionLease = {
  id: string;
  owner: string;
  operation: AiOperation;
  providerId: AiProviderId;
};

export type AiExecutionDenial = {
  reason: "daily_limit" | "concurrency_limit";
  retryAfterSeconds: number;
  limit: number;
};

export type AiExecutionAvailability = AiUsageSummary["availability"];

type AiExecutionReservation =
  | { ok: true; lease: AiExecutionLease }
  | { ok: false; denial: AiExecutionDenial };

type ExecutionCounts = {
  cloudUsed: number;
};

function executionPolicy(): AiExecutionPolicy {
  const runtime = appEnv();
  return aiExecutionPolicy({
    AI_DAILY_CLOUD_LIMIT: runtime.AI_DAILY_CLOUD_LIMIT || process.env.AI_DAILY_CLOUD_LIMIT,
    AI_MAX_CONCURRENT_CLOUD: runtime.AI_MAX_CONCURRENT_CLOUD || process.env.AI_MAX_CONCURRENT_CLOUD,
    AI_MAX_CONCURRENT_LOCAL: runtime.AI_MAX_CONCURRENT_LOCAL || process.env.AI_MAX_CONCURRENT_LOCAL,
  });
}

function changedRows(result: D1Result): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

function retryAfterWindow(oldestRun: string | null, nowMs: number): number {
  if (!oldestRun) return 60;
  const oldestRunMs = Date.parse(oldestRun);
  if (!Number.isFinite(oldestRunMs)) return 60;
  const resetMs = oldestRunMs + AI_CLOUD_WINDOW_MS;
  return Math.max(1, Math.ceil((resetMs - nowMs) / 1_000));
}

async function executionCounts(
  db: D1Database,
  owner: string,
  cutoff: string,
): Promise<ExecutionCounts> {
  const row = await db.prepare(`
    SELECT
      SUM(CASE WHEN provider_id = 'openai' AND created_at >= ? THEN 1 ELSE 0 END) AS cloudUsed
    FROM ai_operation_runs
    WHERE owner_email = ?
  `).bind(cutoff, owner).first<ExecutionCounts>();
  return {
    cloudUsed: Number(row?.cloudUsed ?? 0),
  };
}

async function cloudCapacityRun(
  db: D1Database,
  owner: string,
  cutoff: string,
  used: number,
  limit: number,
): Promise<string | null> {
  if (used < limit) return null;
  const row = await db.prepare(`
    SELECT created_at AS createdAt
    FROM ai_operation_runs
    WHERE owner_email = ? AND provider_id = 'openai' AND created_at >= ?
    ORDER BY created_at ASC
    LIMIT 1 OFFSET ?
  `).bind(owner, cutoff, used - limit).first<{ createdAt: string }>();
  return row?.createdAt ?? null;
}

export async function reserveAiExecution(input: {
  owner: string;
  operation: AiOperation;
  providerId: AiProviderId;
  now?: Date;
}): Promise<AiExecutionReservation> {
  const db = await ensureDatabase();
  const policy = executionPolicy();
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const createdAt = now.toISOString();
  const cloudCutoff = new Date(nowMs - AI_CLOUD_WINDOW_MS).toISOString();
  const staleCutoff = new Date(nowMs - AI_ACTIVE_STALE_MS).toISOString();
  const concurrencyLimit = aiProviderConcurrencyLimit(input.providerId, policy);
  const id = crypto.randomUUID();
  const insert = input.providerId === "openai"
    ? db.prepare(`
        INSERT INTO ai_operation_runs
          (id, owner_email, operation, provider_id, status, created_at, finished_at)
        SELECT ?, ?, ?, ?, 'active', ?, NULL
        WHERE (
          SELECT COUNT(*) FROM ai_operation_runs
          WHERE owner_email = ? AND provider_id = 'openai' AND created_at >= ?
        ) < ?
        AND (
          SELECT COUNT(*) FROM ai_operation_runs
          WHERE owner_email = ? AND provider_id = ? AND status = 'active'
        ) < ?
      `).bind(
        id, input.owner, input.operation, input.providerId, createdAt,
        input.owner, cloudCutoff, policy.cloudDailyLimit,
        input.owner, input.providerId, concurrencyLimit,
      )
    : db.prepare(`
        INSERT INTO ai_operation_runs
          (id, owner_email, operation, provider_id, status, created_at, finished_at)
        SELECT ?, ?, ?, ?, 'active', ?, NULL
        WHERE (
          SELECT COUNT(*) FROM ai_operation_runs
          WHERE owner_email = ? AND provider_id = ? AND status = 'active'
        ) < ?
      `).bind(
        id, input.owner, input.operation, input.providerId, createdAt,
        input.owner, input.providerId, concurrencyLimit,
      );
  const [, reservation] = await db.batch([
    db.prepare(`
      UPDATE ai_operation_runs
      SET status = 'expired', finished_at = ?
      WHERE owner_email = ? AND provider_id = ? AND status = 'active' AND created_at < ?
    `).bind(createdAt, input.owner, input.providerId, staleCutoff),
    insert,
  ]);
  if (changedRows(reservation) === 1) {
    return {
      ok: true,
      lease: { id, owner: input.owner, operation: input.operation, providerId: input.providerId },
    };
  }

  const counts = await executionCounts(db, input.owner, cloudCutoff);
  if (input.providerId === "openai" && counts.cloudUsed >= policy.cloudDailyLimit) {
    const capacityRun = await cloudCapacityRun(
      db,
      input.owner,
      cloudCutoff,
      counts.cloudUsed,
      policy.cloudDailyLimit,
    );
    return {
      ok: false,
      denial: {
        reason: "daily_limit",
        retryAfterSeconds: retryAfterWindow(capacityRun, nowMs),
        limit: policy.cloudDailyLimit,
      },
    };
  }
  return {
    ok: false,
    denial: {
      reason: "concurrency_limit",
      retryAfterSeconds: 15,
      limit: concurrencyLimit,
    },
  };
}

export function aiExecutionDeniedResponse(denial: AiExecutionDenial): Response {
  const daily = denial.reason === "daily_limit";
  const response = jsonError(
    daily
      ? `Alcanzó el límite de ${denial.limit} operaciones de IA en 24 horas.`
      : `Ya hay ${denial.limit} operaciones de IA en curso. Espere a que finalicen.`,
    429,
    daily ? "AI_DAILY_LIMIT_REACHED" : "AI_CONCURRENCY_LIMIT_REACHED",
  );
  response.headers.set("retry-after", String(denial.retryAfterSeconds));
  return response;
}

async function finishAiExecution(lease: AiExecutionLease, status: Exclude<AiExecutionStatus, "active">) {
  const db = await ensureDatabase();
  const result = await db.prepare(`
    UPDATE ai_operation_runs
    SET status = ?, finished_at = ?
    WHERE id = ? AND owner_email = ? AND status = 'active'
  `).bind(status, new Date().toISOString(), lease.id, lease.owner).run();
  if (changedRows(result) !== 1) throw new Error("No se pudo cerrar la ejecución de IA.");
}

async function finishAiExecutionBestEffort(
  lease: AiExecutionLease,
  status: Exclude<AiExecutionStatus, "active">,
): Promise<void> {
  try {
    await finishAiExecution(lease, status);
  } catch {
    console.error(JSON.stringify({
      level: "error",
      event: "ai_execution_finalize_failed",
      operation: lease.operation,
      providerId: lease.providerId,
      status,
    }));
  }
}

export async function runAiExecution<T>(
  lease: AiExecutionLease,
  action: (signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  let result: T;
  try {
    result = await withAiExecutionTimeout(
      action,
      options.timeoutMs ?? aiOperationTimeoutMs(lease.operation),
      options.signal,
    );
  } catch (error) {
    await finishAiExecutionBestEffort(lease, aiExecutionFailureStatus(error));
    throw error;
  }
  await finishAiExecutionBestEffort(lease, "completed");
  return result;
}

export async function failAiExecution(lease: AiExecutionLease): Promise<void> {
  await finishAiExecution(lease, "failed");
}

export async function getAiExecutionAvailability(owner: string): Promise<AiExecutionAvailability> {
  const db = await ensureDatabase();
  const policy = executionPolicy();
  const nowMs = Date.now();
  const cloudCutoff = new Date(nowMs - AI_CLOUD_WINDOW_MS).toISOString();
  const activeCutoff = new Date(nowMs - AI_ACTIVE_STALE_MS).toISOString();
  const row = await db.prepare(`
    SELECT
      SUM(CASE WHEN provider_id = 'openai' AND created_at >= ? THEN 1 ELSE 0 END) AS cloudUsed,
      SUM(CASE WHEN provider_id = 'openai' AND status = 'active' AND created_at >= ? THEN 1 ELSE 0 END) AS activeCloud,
      SUM(CASE WHEN provider_id = 'gemma_local' AND status = 'active' AND created_at >= ? THEN 1 ELSE 0 END) AS activeLocal
    FROM ai_operation_runs
    WHERE owner_email = ?
  `).bind(cloudCutoff, activeCutoff, activeCutoff, owner).first<{
    cloudUsed: number;
    activeCloud: number;
    activeLocal: number;
  }>();
  const used = Number(row?.cloudUsed ?? 0);
  const remaining = Math.max(0, policy.cloudDailyLimit - used);
  const capacityRun = remaining === 0
    ? await cloudCapacityRun(db, owner, cloudCutoff, used, policy.cloudDailyLimit)
    : null;
  return {
    cloud: {
      limit: policy.cloudDailyLimit,
      used,
      remaining,
      nextAvailableAt: capacityRun
        ? new Date(Date.parse(capacityRun) + AI_CLOUD_WINDOW_MS).toISOString()
        : null,
    },
    concurrency: {
      cloud: { limit: policy.cloudConcurrencyLimit, active: Number(row?.activeCloud ?? 0) },
      local: { limit: policy.localConcurrencyLimit, active: Number(row?.activeLocal ?? 0) },
    },
  };
}
