import { env } from "cloudflare:workers";

export type AppEnv = {
  DB: D1Database;
  FILES: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  LOCAL_AI_BASE_URL?: string;
  LOCAL_AI_MODEL?: string;
  LOCAL_AI_API_KEY?: string;
};

export function appEnv(): AppEnv {
  return env as unknown as AppEnv;
}
