import assert from "node:assert/strict";
import test from "node:test";
import { requestOwner } from "../../app/lib/server/auth.ts";
import { safeFileName } from "../../app/lib/server/security.ts";
import {
  nextDocumentVersion,
  normalizeDocumentStatus,
  requiresPatientIdentity,
} from "../../app/features/documents/document-policy.ts";
import { isActiveMobileSession } from "../../app/features/files/mobile-session-policy.ts";

test("requires an authenticated owner outside the local preview", () => {
  assert.equal(requestOwner(new Request("https://hhr.example/documentos")), null);
  assert.equal(
    requestOwner(new Request("https://hhr.example/documentos", {
      headers: { "oai-authenticated-user-email": "  Doctor@HHR.CL " },
    })),
    "doctor@hhr.cl",
  );
  assert.equal(requestOwner(new Request("http://localhost:3000/documentos")), "preview@hhr.local");
  assert.equal(requestOwner(new Request("http://127.0.0.1:3000/documentos")), "preview@hhr.local");
});

test("normalizes uploaded file names without preserving path syntax", () => {
  assert.equal(safeFileName("  Résonância / tórax?.PDF  "), "Resonancia torax.PDF");
  assert.equal(safeFileName("../../"), "archivo");
  assert.equal(safeFileName("a".repeat(150)).length, 120);
});

test("creates a document version only for a new non-draft clinical state", () => {
  assert.equal(normalizeDocumentStatus("desconocido"), "Borrador");
  assert.equal(normalizeDocumentStatus("Revisado"), "Revisado");
  assert.equal(requiresPatientIdentity("Borrador"), false);
  assert.equal(requiresPatientIdentity("Finalizado"), true);
  assert.equal(nextDocumentVersion(null, "Borrador"), 1);
  assert.equal(nextDocumentVersion({ version: 3, status: "Borrador" }, "Borrador"), 3);
  assert.equal(nextDocumentVersion({ version: 3, status: "Borrador" }, "Revisado"), 4);
  assert.equal(nextDocumentVersion({ version: 4, status: "Revisado" }, "Revisado"), 4);
  assert.equal(nextDocumentVersion({ version: 4, status: "Revisado" }, "Finalizado"), 5);
});

test("accepts only active, unexpired mobile upload sessions", () => {
  const now = Date.parse("2026-07-27T12:00:00.000Z");
  assert.equal(isActiveMobileSession(null, now), false);
  assert.equal(isActiveMobileSession({ status: "revocada", expiresAt: "2026-07-27T12:10:00.000Z" }, now), false);
  assert.equal(isActiveMobileSession({ status: "activa", expiresAt: "invalid" }, now), false);
  assert.equal(isActiveMobileSession({ status: "activa", expiresAt: "2026-07-27T12:00:00.000Z" }, now), false);
  assert.equal(isActiveMobileSession({ status: "activa", expiresAt: "2026-07-27T12:10:00.000Z" }, now), true);
});
