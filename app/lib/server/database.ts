import { appEnv } from "./environment";

export async function ensureDatabase(): Promise<D1Database> {
  const db = appEnv().DB;
  if (!db) throw new Error("La base de datos no está disponible.");
  return db;
}
