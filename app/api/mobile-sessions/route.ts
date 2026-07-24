import { audit, ensureDatabase, jsonError, requestOwner, sha256 } from "@/app/lib/server";

export async function POST(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(tokenBytes, byte => byte.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const db = await ensureDatabase();
  await db.prepare(`INSERT INTO mobile_upload_sessions (id, owner_email, token_hash, expires_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'activa', ?, ?)`).bind(id, owner, tokenHash, expiresAt, now.toISOString(), now.toISOString()).run();
  await audit(owner, "created", "mobile_session", id, { expiresAt });
  return Response.json({ session: { id, token, expiresAt, status: "activa" } }, { status: 201 });
}

export async function PATCH(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const payload = await request.json() as { id?: string };
  if (!payload.id) return jsonError("Sesión no identificada.");
  const db = await ensureDatabase();
  await db.prepare(`UPDATE mobile_upload_sessions SET status = 'revocada', updated_at = ? WHERE id = ? AND owner_email = ?`).bind(new Date().toISOString(), payload.id, owner).run();
  await audit(owner, "revoked", "mobile_session", payload.id);
  return Response.json({ ok: true });
}
