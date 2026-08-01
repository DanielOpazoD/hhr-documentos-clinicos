import { isActiveMobileSession, MOBILE_CAPTURE_MAX_FILES } from "@/app/features/files/mobile-session-policy";
import { discardPendingFile } from "@/app/features/files/server/delete-files";
import { ensureDatabase } from "@/app/lib/server/database";
import { appEnv } from "@/app/lib/server/environment";
import { observeApi } from "@/app/lib/server/http";
import { safeFileName, sha256 } from "@/app/lib/server/security";

const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);
const maxBytes = 15 * 1024 * 1024;
const uploadIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
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

type StoredCapturedFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  origin: string;
  status: string;
  createdAt: string;
};

function captureJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: captureHeaders });
}

function captureError(message: string, status = 400, code?: string): Response {
  return captureJson(code ? { error: message, code } : { error: message }, status);
}

function changedRows(result: D1Result): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

async function remainingFileCapacity(db: D1Database, sessionId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS fileCount
     FROM files
     WHERE mobile_session_id = ? AND status IN ('pendiente', 'activo', 'archivado')`,
  ).bind(sessionId).first<{ fileCount: number }>();
  return Math.max(0, MOBILE_CAPTURE_MAX_FILES - (row?.fileCount ?? 0));
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

async function getCaptureSession(request: Request) {
  const resolved = await resolveSession(request);
  if (!resolved || !isActiveMobileSession(resolved.session)) {
    return captureError("Este enlace expiró o fue revocado.", 410);
  }
  const remainingFiles = await remainingFileCapacity(resolved.db, resolved.session.id);

  return captureJson({
    session: {
      id: resolved.session.id,
      expiresAt: resolved.session.expiresAt,
      remainingFiles,
    },
  });
}

async function uploadCapturedFile(request: Request) {
  const resolved = await resolveSession(request);
  if (!resolved || !isActiveMobileSession(resolved.session)) {
    return captureError("Este enlace expiró o fue revocado.", 410);
  }
  const id = request.headers.get("x-hhr-upload-id")?.trim().toLowerCase() ?? "";
  if (!uploadIdPattern.test(id)) return captureError("Identificador de carga inválido.", 400, "invalid_upload_id");

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

  const name = safeFileName(file.name);
  const objectKey = `${resolved.session.ownerEmail}/${id}/${crypto.randomUUID()}-${name}`;
  const bucket = appEnv().FILES;
  const reservedAt = new Date().toISOString();
  const reservation = await resolved.db.batch([
    resolved.db.prepare(
      `DELETE FROM files
       WHERE id = ? AND owner_email = ? AND mobile_session_id = ? AND status = 'eliminado'
         AND NOT EXISTS (
           SELECT 1
           FROM audit_events
           WHERE owner_email = ? AND action = 'uploaded'
             AND entity_type = 'file' AND entity_id = files.id
         )`,
    ).bind(id, resolved.session.ownerEmail, resolved.session.id, resolved.session.ownerEmail),
    resolved.db.prepare(
      `INSERT OR IGNORE INTO files
       (id, owner_email, mobile_session_id, object_key, name, mime_type, size, origin, status, patient_id, created_at, updated_at)
       SELECT ?, owner_email, id, ?, ?, ?, ?, 'QR móvil', 'pendiente', NULL, ?, ?
       FROM mobile_upload_sessions
       WHERE id = ? AND token_hash = ? AND status = 'activa' AND expires_at > ?
         AND (
           SELECT COUNT(*)
           FROM files
           WHERE mobile_session_id = mobile_upload_sessions.id
             AND status IN ('pendiente', 'activo', 'archivado')
         ) < ?
         AND NOT EXISTS (
           SELECT 1
           FROM audit_events
           WHERE owner_email = mobile_upload_sessions.owner_email
             AND action = 'uploaded' AND entity_type = 'file' AND entity_id = ?
         )`,
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
      MOBILE_CAPTURE_MAX_FILES,
      id,
    ),
  ]);
  const pending = reservation[1];
  if (changedRows(pending) === 0) {
    const activeSession = await resolved.db.prepare(
      `SELECT id
       FROM mobile_upload_sessions
       WHERE id = ? AND token_hash = ? AND status = 'activa' AND expires_at > ?`,
    ).bind(resolved.session.id, resolved.tokenHash, reservedAt).first<{ id: string }>();
    if (!activeSession) return captureError("Este enlace expiró o fue revocado.", 410);

    const existing = await resolved.db.prepare(
      `SELECT id, name, mime_type AS mimeType, size, origin, status, created_at AS createdAt
       FROM files
       WHERE id = ? AND owner_email = ? AND mobile_session_id = ?`,
    ).bind(id, resolved.session.ownerEmail, resolved.session.id).first<StoredCapturedFile>();
    if (existing?.status === "activo" || existing?.status === "archivado") {
      const remainingFiles = await remainingFileCapacity(resolved.db, resolved.session.id);
      return captureJson({
        file: {
          id: existing.id,
          name: existing.name,
          mimeType: existing.mimeType,
          size: existing.size,
          origin: existing.origin,
          createdAt: existing.createdAt,
        },
        remainingFiles,
      });
    }
    if (existing?.status === "pendiente") {
      return captureError("Esta carga aún se está procesando. Reintente en unos segundos.", 425, "upload_pending");
    }
    if (existing?.status === "eliminado") {
      return captureError("El archivo asociado a esta carga fue eliminado.", 409, "upload_deleted");
    }
    const uploadedReceipt = await resolved.db.prepare(
      `SELECT id
       FROM audit_events
       WHERE owner_email = ? AND action = 'uploaded'
         AND entity_type = 'file' AND entity_id = ?
       LIMIT 1`,
    ).bind(resolved.session.ownerEmail, id).first<{ id: string }>();
    if (uploadedReceipt) {
      return captureError("El archivo asociado a esta carga fue eliminado.", 409, "upload_deleted");
    }
    return captureError(`Esta sesión admite hasta ${MOBILE_CAPTURE_MAX_FILES} archivos.`, 409, "capacity_exhausted");
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

  const remainingFiles = await remainingFileCapacity(resolved.db, resolved.session.id);

  return captureJson({
    file: {
      id,
      name,
      mimeType: file.type,
      size: file.size,
      origin: "QR móvil",
      createdAt: reservedAt,
    },
    remainingFiles,
  }, 201);
}

export const GET = observeApi("mobile-upload.GET", getCaptureSession);
export const POST = observeApi("mobile-upload.POST", uploadCapturedFile);
