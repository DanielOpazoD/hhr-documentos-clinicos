import {
  deriveMobileSessionStatus,
  MOBILE_SESSION_TTL_MS,
  type DerivedMobileSessionStatus,
} from "@/app/features/files/mobile-session-policy";
import { cleanupPendingFileDeletes } from "@/app/features/files/server/delete-files";
import { requestOwner } from "@/app/lib/server/auth";
import { ensureDatabase } from "@/app/lib/server/database";
import { jsonError, readJsonObject } from "@/app/lib/server/http";
import { sha256 } from "@/app/lib/server/security";
import { after } from "next/server";

type StoredMobileSession = {
  id: string;
  expiresAt: string;
  status: string;
};

type StoredSessionFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  origin: string;
  status: string;
  patientId: string | null;
  createdAt: string;
};

type SessionSnapshotRow = StoredMobileSession | StoredSessionFile;

const privateResponse = { "Cache-Control": "private, no-store" };
const storedSessionQuery =
  "SELECT id, expires_at AS expiresAt, status FROM mobile_upload_sessions WHERE id = ? AND owner_email = ?";
const storedSessionFilesQuery = `SELECT id, name, mime_type AS mimeType, size, origin, status, patient_id AS patientId, created_at AS createdAt
  FROM files
  WHERE owner_email = ? AND mobile_session_id = ? AND status IN ('activo', 'archivado')
  ORDER BY created_at DESC
  LIMIT 100`;

function changedRows(result: D1Result): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

function sessionResponse(session: StoredMobileSession, status?: DerivedMobileSessionStatus) {
  return {
    id: session.id,
    expiresAt: session.expiresAt,
    status: status ?? deriveMobileSessionStatus(session),
  };
}

function isStoredMobileSession(row: SessionSnapshotRow | undefined): row is StoredMobileSession {
  return Boolean(row && "expiresAt" in row && typeof row.expiresAt === "string");
}

async function fenceExpiredSession(
  db: D1Database,
  owner: string,
  session: StoredMobileSession,
  snapshotAt: string,
) {
  const results = await db.batch<SessionSnapshotRow>([
    db.prepare(
      `UPDATE mobile_upload_sessions
       SET status = 'expirada', updated_at = ?
       WHERE id = ? AND owner_email = ? AND status = 'activa'
         AND expires_at = ? AND expires_at <= ?`,
    ).bind(snapshotAt, session.id, owner, session.expiresAt, snapshotAt),
    db.prepare(storedSessionQuery).bind(session.id, owner),
    db.prepare(storedSessionFilesQuery).bind(owner, session.id),
  ]);

  const sessionRows = results[1].results;
  const files = results[2].results;
  if (!sessionRows || !files) throw new Error("No se pudo consolidar la sesión expirada.");
  const fencedSession = sessionRows[0];
  if (!isStoredMobileSession(fencedSession)) return null;
  return { session: fencedSession, files };
}

export async function GET(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id || id.length > 100) return jsonError("Sesión no identificada.");

  const db = await ensureDatabase();
  const session = await db.prepare(storedSessionQuery).bind(id, owner).first<StoredMobileSession>();
  if (!session) return jsonError("Sesión no encontrada.", 404);

  const snapshotAt = new Date().toISOString();
  const snapshotStatus = deriveMobileSessionStatus(session, Date.parse(snapshotAt));
  if (session.status === "activa" && snapshotStatus === "expirada") {
    const snapshot = await fenceExpiredSession(db, owner, session, snapshotAt);
    if (!snapshot) return jsonError("Sesión no encontrada.", 404);
    return Response.json({
      session: sessionResponse(
        snapshot.session,
        deriveMobileSessionStatus(snapshot.session, Date.parse(snapshotAt)),
      ),
      files: snapshot.files,
    }, { headers: privateResponse });
  }

  const result = await db.prepare(storedSessionFilesQuery).bind(owner, session.id).all<StoredSessionFile>();

  return Response.json({
    session: sessionResponse(session, snapshotStatus),
    files: result.results,
  }, { headers: privateResponse });
}

export async function POST(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  after(() => cleanupPendingFileDeletes(owner).catch(() => undefined));

  const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + MOBILE_SESSION_TTL_MS).toISOString();
  const db = await ensureDatabase();

  await db.batch([
    db.prepare(
      `INSERT INTO audit_events
       (id, owner_email, action, entity_type, entity_id, metadata_json, created_at)
       SELECT lower(hex(randomblob(16))), owner_email, 'revoked', 'mobile_session', id, ?, ?
       FROM mobile_upload_sessions
       WHERE owner_email = ? AND status = 'activa'`,
    ).bind(JSON.stringify({ reason: "superseded" }), createdAt, owner),
    db.prepare(
      "UPDATE mobile_upload_sessions SET status = 'revocada', updated_at = ? WHERE owner_email = ? AND status = 'activa'",
    ).bind(createdAt, owner),
    db.prepare(
      `INSERT INTO mobile_upload_sessions
       (id, owner_email, token_hash, expires_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'activa', ?, ?)`,
    ).bind(id, owner, tokenHash, expiresAt, createdAt, createdAt),
    db.prepare(
      `INSERT INTO audit_events
       (id, owner_email, action, entity_type, entity_id, metadata_json, created_at)
       VALUES (?, ?, 'created', 'mobile_session', ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      owner,
      id,
      JSON.stringify({ expiresAt }),
      createdAt,
    ),
  ]);

  return Response.json({
    session: { id, token, expiresAt, status: "activa" },
  }, { status: 201, headers: privateResponse });
}

export async function PATCH(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);

  const payload = await readJsonObject(request);
  const id = typeof payload?.id === "string" ? payload.id.trim() : "";
  if (!id || id.length > 100) return jsonError("Sesión no identificada.");

  const db = await ensureDatabase();
  const now = new Date().toISOString();
  const results = await db.batch([
    db.prepare(
      `INSERT INTO audit_events
       (id, owner_email, action, entity_type, entity_id, metadata_json, created_at)
       SELECT ?, owner_email, 'revoked', 'mobile_session', id, '{}', ?
       FROM mobile_upload_sessions
       WHERE id = ? AND owner_email = ? AND status = 'activa' AND expires_at > ?`,
    ).bind(crypto.randomUUID(), now, id, owner, now),
    db.prepare(
      `UPDATE mobile_upload_sessions
       SET status = 'revocada', updated_at = ?
       WHERE id = ? AND owner_email = ? AND status = 'activa' AND expires_at > ?`,
    ).bind(now, id, owner, now),
  ]);

  if (changedRows(results[1]) > 0) {
    return Response.json({
      ok: true,
      session: { id, status: "revocada" },
    }, { headers: privateResponse });
  }

  const session = await db.prepare(storedSessionQuery).bind(id, owner).first<StoredMobileSession>();
  if (!session) return jsonError("Sesión no encontrada.", 404);

  return Response.json({
    ok: true,
    session: sessionResponse(session),
  }, { headers: privateResponse });
}
