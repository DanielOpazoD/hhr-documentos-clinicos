import { isActiveMobileSession } from "@/app/features/files/mobile-session-policy";
import { discardPendingFile } from "@/app/features/files/server/delete-files";
import { ensureDatabase } from "@/app/lib/server/database";
import { appEnv } from "@/app/lib/server/environment";
import { safeFileName, sha256 } from "@/app/lib/server/security";

const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);
const maxBytes = 15 * 1024 * 1024;
const captureHeaders = {
  "Cache-Control": "no-store",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

type StoredMobileSession = {
  id: string;
  ownerEmail: string;
  expiresAt: string;
  status: string;
};

function captureJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: captureHeaders });
}

function captureError(message: string, status = 400): Response {
  return captureJson({ error: message }, status);
}

function changedRows(result: D1Result): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

async function resolveSession(request: Request) {
  const captureHeader = request.headers.get("x-hhr-capture-token");
  const token = captureHeader?.trim() ?? "";
  if (!/^[a-f0-9]{48}$/.test(token)) return null;

  const db = await ensureDatabase();
  const tokenHash = await sha256(token);
  const session = await db.prepare(
    `SELECT id, owner_email AS ownerEmail, expires_at AS expiresAt, status
     FROM mobile_upload_sessions
     WHERE token_hash = ?`,
  ).bind(tokenHash).first<StoredMobileSession>();

  return session ? { db, session, tokenHash } : null;
}

export async function GET(request: Request) {
  const resolved = await resolveSession(request);
  if (!resolved || !isActiveMobileSession(resolved.session)) {
    return captureError("Este enlace expiró o fue revocado.", 410);
  }

  return captureJson({
    session: {
      id: resolved.session.id,
      expiresAt: resolved.session.expiresAt,
    },
  });
}

export async function POST(request: Request) {
  const resolved = await resolveSession(request);
  if (!resolved || !isActiveMobileSession(resolved.session)) {
    return captureError("Este enlace expiró o fue revocado.", 410);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return captureError("Selecciona un archivo válido.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size > maxBytes || !allowedTypes.has(file.type)) {
    return captureError("Archivo no permitido o superior a 15 MB.");
  }

  const id = crypto.randomUUID();
  const name = safeFileName(file.name);
  const objectKey = `${resolved.session.ownerEmail}/${id}/${name}`;
  const bucket = appEnv().FILES;
  const reservedAt = new Date().toISOString();
  const pending = await resolved.db.prepare(
    `INSERT INTO files
     (id, owner_email, mobile_session_id, object_key, name, mime_type, size, origin, status, patient_id, created_at, updated_at)
     SELECT ?, owner_email, id, ?, ?, ?, ?, 'QR móvil', 'pendiente', NULL, ?, ?
     FROM mobile_upload_sessions
     WHERE id = ? AND token_hash = ? AND status = 'activa' AND expires_at > ?`,
  ).bind(
    id,
    objectKey,
    name,
    file.type,
    file.size,
    reservedAt,
    reservedAt,
    resolved.session.id,
    resolved.tokenHash,
    reservedAt,
  ).run();
  if (changedRows(pending) === 0) {
    return captureError("Este enlace expiró o fue revocado.", 410);
  }

  try {
    await bucket.put(objectKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        owner: resolved.session.ownerEmail,
        sessionId: resolved.session.id,
      },
    });
  } catch (error) {
    try {
      await discardPendingFile(resolved.session.ownerEmail, id);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "La carga falló y quedó una limpieza pendiente.",
      );
    }
    throw error;
  }

  const finalizedAt = new Date().toISOString();
  let results: D1Result[];
  try {
    results = await resolved.db.batch([
      resolved.db.prepare(
        `UPDATE files
         SET status = 'activo', updated_at = ?
         WHERE id = ? AND mobile_session_id = ? AND status = 'pendiente'
           AND EXISTS (
             SELECT 1
             FROM mobile_upload_sessions AS session
             WHERE session.id = files.mobile_session_id
               AND session.token_hash = ?
               AND session.status = 'activa'
               AND session.expires_at > ?
           )`,
      ).bind(
        finalizedAt,
        id,
        resolved.session.id,
        resolved.tokenHash,
        finalizedAt,
      ),
      resolved.db.prepare(
        `INSERT INTO audit_events
         (id, owner_email, action, entity_type, entity_id, metadata_json, created_at)
         SELECT ?, owner_email, 'uploaded', 'file', id, ?, ?
         FROM files
         WHERE id = ? AND mobile_session_id = ? AND status = 'activo' AND updated_at = ?`,
      ).bind(
        crypto.randomUUID(),
        JSON.stringify({
          origin: "QR móvil",
          sessionId: resolved.session.id,
          size: file.size,
        }),
        finalizedAt,
        id,
        resolved.session.id,
        finalizedAt,
      ),
    ]);
  } catch (error) {
    try {
      await discardPendingFile(resolved.session.ownerEmail, id);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "La carga falló y quedó una limpieza pendiente.",
      );
    }
    throw error;
  }

  if (changedRows(results[0]) === 0) {
    try {
      await discardPendingFile(resolved.session.ownerEmail, id);
    } catch (cleanupError) {
      throw new AggregateError(
        [cleanupError],
        "La sesión se cerró y quedó una limpieza pendiente.",
      );
    }
    return captureError("Este enlace expiró o fue revocado.", 410);
  }

  return captureJson({
    file: {
      id,
      name,
      mimeType: file.type,
      size: file.size,
      origin: "QR móvil",
      createdAt: reservedAt,
    },
  }, 201);
}
