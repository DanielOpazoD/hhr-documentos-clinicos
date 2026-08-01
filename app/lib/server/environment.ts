import { env } from "cloudflare:workers";

export type AppEnv = {
  DB: D1Database;
  FILES: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  LOCAL_AI_BASE_URL?: string;
  LOCAL_AI_MODEL?: string;
  LOCAL_AI_API_KEY?: string;
  AI_DAILY_CLOUD_LIMIT?: string;
  AI_MAX_CONCURRENT_CLOUD?: string;
  AI_MAX_CONCURRENT_LOCAL?: string;
  GOOGLE_DRIVE_CLIENT_ID?: string;
  GOOGLE_DRIVE_API_KEY?: string;
  GOOGLE_DRIVE_APP_ID?: string;
};

export function appEnv(): AppEnv {
  return env as unknown as AppEnv;
}
