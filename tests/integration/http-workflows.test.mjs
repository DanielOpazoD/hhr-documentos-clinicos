import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { after, before, test } from "node:test";
import { startLocalApp } from "./local-app.mjs";

let app;

before(async () => {
  app = await startLocalApp();
});

after(async () => {
  await app?.close();
});

function ownedFetch(owner, path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("oai-authenticated-user-email", owner);
  return fetch(`${app.origin}${path}`, { ...init, headers });
}

async function jsonResponse(response, expectedStatus) {
  const body = await response.json();
  assert.equal(response.status, expectedStatus, JSON.stringify(body));
  return body;
}

function jsonRequest(owner, path, method, body) {
  return ownedFetch(owner, path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function externalRequest(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const request = httpRequest(`${app.origin}${path}`, {
      method,
      headers: { Host: "private.hhr.example" },
    }, (result) => {
      const chunks = [];
      result.on("data", (chunk) => chunks.push(chunk));
      result.on("end", () => resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        headers: result.headers,
        status: result.statusCode,
      }));
    });
    request.once("error", reject);
    request.end();
  });
}

test("serves the critical private application routes", async () => {
  const routes = [
    ["/", "<title>Inicio · HHR-documentos</title>"],
    ["/documentos", "<title>Documentos · HHR-documentos</title>"],
    ["/ia", "<title>Asistente IA · HHR-documentos</title>"],
  ];

  for (const [path, title] of routes) {
    const response = await fetch(`${app.origin}${path}`);
    assert.equal(response.status, 200, `${path}\n${app.output()}`);
    assert.match(await response.text(), new RegExp(title));
  }
});

test("requires an authenticated owner outside the local preview", async () => {
  const privateEndpoints = [
    ["/api/documents", "GET"],
    ["/api/files", "GET"],
    ["/api/signatures", "GET"],
    ["/api/ai/prompts", "GET"],
    ["/api/ai/providers", "GET"],
    ["/api/ai/usage", "GET"],
    ["/api/mobile-sessions", "POST"],
  ];

  for (const [path, method] of privateEndpoints) {
    const response = await externalRequest(path, method);
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.deepEqual(JSON.parse(response.body), { error: "Autenticación requerida." });
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["x-frame-options"], "SAMEORIGIN");
  }
});

test("preserves document ownership, concurrency and recovery over HTTP", async () => {
  const ownerA = `documents-a-${crypto.randomUUID()}@hhr.test`;
  const ownerB = `documents-b-${crypto.randomUUID()}@hhr.test`;
  const documentId = crypto.randomUUID();
  const originalContent = {
    sections: [{ id: "section-1", title: "Sección sintética", body: "Contenido inicial de prueba." }],
  };

  const invalidReview = await jsonResponse(await jsonRequest(ownerA, "/api/documents", "POST", {
    id: crypto.randomUUID(),
    title: "Documento sin identidad",
    status: "Revisado",
    content: {},
  }), 400);
  assert.match(invalidReview.error, /Identifique al paciente/);

  const created = await jsonResponse(await jsonRequest(ownerA, "/api/documents", "POST", {
    id: documentId,
    templateId: "documento_libre",
    title: "Documento sintético",
    status: "Borrador",
    content: originalContent,
  }), 201);
  assert.equal(created.document.id, documentId);
  assert.equal(created.document.version, 1);

  const fetched = await jsonResponse(await ownedFetch(ownerA, `/api/documents?id=${documentId}`), 200);
  assert.deepEqual(fetched.document.content, originalContent);
  assert.equal(fetched.document.status, "Borrador");
  await jsonResponse(await ownedFetch(ownerB, `/api/documents?id=${documentId}`), 404);

  await new Promise((resolve) => setTimeout(resolve, 5));
  const reviewed = await jsonResponse(await jsonRequest(ownerA, "/api/documents", "POST", {
    id: documentId,
    expectedUpdatedAt: created.document.updatedAt,
    templateId: "documento_libre",
    title: "Documento sintético revisado",
    patientName: "Persona Prueba",
    patientRutMasked: "XX.XXX.XXX-X",
    status: "Revisado",
    content: { sections: [{ id: "section-1", title: "Sección sintética", body: "Contenido revisado." }] },
  }), 200);
  assert.equal(reviewed.document.version, 2);

  const stale = await jsonResponse(await jsonRequest(ownerA, "/api/documents", "POST", {
    id: documentId,
    expectedUpdatedAt: created.document.updatedAt,
    title: "Escritura obsoleta",
    patientName: "Persona Prueba",
    status: "Revisado",
    content: {},
  }), 409);
  assert.match(stale.error, /otra pestaña/);

  await new Promise((resolve) => setTimeout(resolve, 5));
  const concurrentWrites = await Promise.all([
    jsonRequest(ownerA, "/api/documents", "POST", {
      id: documentId,
      expectedUpdatedAt: reviewed.document.updatedAt,
      title: "Edición concurrente A",
      patientName: "Persona Prueba",
      status: "Revisado",
      content: { sections: [] },
    }),
    jsonRequest(ownerA, "/api/documents", "POST", {
      id: documentId,
      expectedUpdatedAt: reviewed.document.updatedAt,
      title: "Edición concurrente B",
      patientName: "Persona Prueba",
      status: "Revisado",
      content: { sections: [] },
    }),
  ]);
  assert.deepEqual(concurrentWrites.map((response) => response.status).sort(), [200, 409]);
  const winningResponse = concurrentWrites.find((response) => response.status === 200);
  const winner = await jsonResponse(winningResponse, 200);

  const versions = await jsonResponse(await ownedFetch(ownerA, `/api/documents/${documentId}/versions`), 200);
  assert.deepEqual(versions.versions.map((version) => version.version), [2, 1]);
  await jsonResponse(await ownedFetch(ownerB, `/api/documents/${documentId}/versions`), 404);

  const restored = await jsonResponse(await jsonRequest(ownerA, `/api/documents/${documentId}/versions`, "POST", {
    version: 1,
    expectedUpdatedAt: winner.document.updatedAt,
  }), 200);
  assert.equal(restored.sourceVersion, 1);
  assert.equal(restored.restoredVersion, 4);

  const current = await jsonResponse(await ownedFetch(ownerA, `/api/documents?id=${documentId}`), 200);
  assert.equal(current.document.status, "Borrador");
  assert.equal(current.document.version, 4);
  assert.equal(current.document.title, "Documento sintético");
  assert.deepEqual(current.document.content, originalContent);

  await jsonResponse(await jsonRequest(ownerB, "/api/documents", "DELETE", { ids: [documentId] }), 404);
  await jsonResponse(await ownedFetch(ownerA, `/api/documents?id=${documentId}`), 200);
  const deleted = await jsonResponse(await jsonRequest(ownerA, "/api/documents", "DELETE", { ids: [documentId] }), 200);
  assert.deepEqual(deleted.deletedIds, [documentId]);
  await jsonResponse(await ownedFetch(ownerA, `/api/documents?id=${documentId}`), 404);
});

test("keeps files and signatures private across D1 and R2", async () => {
  const ownerA = `storage-a-${crypto.randomUUID()}@hhr.test`;
  const ownerB = `storage-b-${crypto.randomUUID()}@hhr.test`;
  const imageBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const upload = new FormData();
  upload.set("file", new File([imageBytes], "captura-sintetica.png", { type: "image/png" }));
  upload.set("origin", "Integración local");

  const uploaded = await jsonResponse(await ownedFetch(ownerA, "/api/files", {
    method: "POST",
    body: upload,
  }), 201);
  const fileId = uploaded.file.id;

  const ownerFiles = await jsonResponse(await ownedFetch(ownerA, "/api/files"), 200);
  assert.equal(ownerFiles.files.some((file) => file.id === fileId), true);
  const otherFiles = await jsonResponse(await ownedFetch(ownerB, "/api/files"), 200);
  assert.equal(otherFiles.files.some((file) => file.id === fileId), false);

  const inlineFile = await ownedFetch(ownerA, `/api/files/${fileId}`);
  assert.equal(inlineFile.status, 200);
  assert.equal(inlineFile.headers.get("content-type"), "image/png");
  assert.match(inlineFile.headers.get("content-disposition"), /^inline;/);
  assert.equal(inlineFile.headers.get("cache-control"), "private, max-age=60");
  assert.deepEqual(new Uint8Array(await inlineFile.arrayBuffer()), imageBytes);
  await jsonResponse(await ownedFetch(ownerB, `/api/files/${fileId}`), 404);

  const attachment = await ownedFetch(ownerA, `/api/files/${fileId}?download=1`);
  assert.equal(attachment.status, 200);
  assert.match(attachment.headers.get("content-disposition"), /^attachment;/);
  await attachment.arrayBuffer();

  await jsonResponse(await jsonRequest(ownerB, "/api/files", "PATCH", {
    id: fileId,
    name: "Intento ajeno.png",
  }), 404);
  const renamed = await jsonResponse(await jsonRequest(ownerA, "/api/files", "PATCH", {
    id: fileId,
    name: "Captura renombrada.png",
    status: "archivado",
  }), 200);
  assert.equal(renamed.file.name, "Captura renombrada.png");
  assert.equal(renamed.file.status, "archivado");

  await jsonResponse(await ownedFetch(ownerB, `/api/files/${fileId}`, { method: "DELETE" }), 404);
  assert.equal((await ownedFetch(ownerA, `/api/files/${fileId}`)).status, 200);
  const deletedFile = await jsonResponse(await ownedFetch(ownerA, `/api/files/${fileId}`, { method: "DELETE" }), 200);
  assert.deepEqual(deletedFile.deletedIds, [fileId]);
  await jsonResponse(await ownedFetch(ownerA, `/api/files/${fileId}`), 404);

  async function createSignature(name) {
    const form = new FormData();
    form.set("file", new File([imageBytes], `${name}.png`, { type: "image/png" }));
    form.set("professionalName", `Profesional ${name}`);
    form.set("specialty", "Especialidad sintética");
    return jsonResponse(await ownedFetch(ownerA, "/api/signatures", { method: "POST", body: form }), 201);
  }

  const firstSignature = (await createSignature("Prueba Uno")).signature;
  const secondSignature = (await createSignature("Prueba Dos")).signature;
  assert.equal(firstSignature.isDefault, true);
  assert.equal(secondSignature.isDefault, false);
  const otherSignatures = await jsonResponse(await ownedFetch(ownerB, "/api/signatures"), 200);
  assert.deepEqual(otherSignatures.signatures, []);

  const signatureImage = await ownedFetch(ownerA, `/api/signatures/${firstSignature.id}`);
  assert.equal(signatureImage.status, 200);
  assert.deepEqual(new Uint8Array(await signatureImage.arrayBuffer()), imageBytes);
  await jsonResponse(await ownedFetch(ownerB, `/api/signatures/${firstSignature.id}`), 404);
  await jsonResponse(await jsonRequest(ownerB, `/api/signatures/${secondSignature.id}`, "PATCH", { isDefault: true }), 404);

  await jsonResponse(await jsonRequest(ownerA, `/api/signatures/${secondSignature.id}`, "PATCH", { isDefault: true }), 200);
  const defaulted = await jsonResponse(await ownedFetch(ownerA, "/api/signatures"), 200);
  assert.equal(defaulted.signatures.find((signature) => signature.id === secondSignature.id).isDefault, true);
  assert.equal(defaulted.signatures.filter((signature) => signature.isDefault).length, 1);

  await jsonResponse(await ownedFetch(ownerB, `/api/signatures/${secondSignature.id}`, { method: "DELETE" }), 404);
  await jsonResponse(await ownedFetch(ownerA, `/api/signatures/${secondSignature.id}`, { method: "DELETE" }), 200);
  const replacement = await jsonResponse(await ownedFetch(ownerA, "/api/signatures"), 200);
  assert.equal(replacement.signatures.length, 1);
  assert.equal(replacement.signatures[0].id, firstSignature.id);
  assert.equal(replacement.signatures[0].isDefault, true);
  await jsonResponse(await ownedFetch(ownerA, `/api/signatures/${firstSignature.id}`, { method: "DELETE" }), 200);
});

test("keeps mobile capture scoped and AI import offline without authorization", async () => {
  const ownerA = `mobile-a-${crypto.randomUUID()}@hhr.test`;
  const ownerB = `mobile-b-${crypto.randomUUID()}@hhr.test`;
  const sessionBody = await jsonResponse(await ownedFetch(ownerA, "/api/mobile-sessions", { method: "POST" }), 201);
  const { id: sessionId, token, expiresAt } = sessionBody.session;
  assert.match(token, /^[a-f0-9]{48}$/);
  const remainingMs = Date.parse(expiresAt) - Date.now();
  assert.equal(remainingMs > 9 * 60 * 1000 && remainingMs <= 10 * 60 * 1000, true);

  const active = await jsonResponse(await fetch(`${app.origin}/api/mobile-upload/${token}`), 200);
  assert.deepEqual(Object.keys(active.session).sort(), ["expiresAt", "id"]);
  assert.equal(active.session.id, sessionId);

  await ownedFetch(ownerB, "/api/mobile-sessions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: sessionId }),
  });
  await jsonResponse(await fetch(`${app.origin}/api/mobile-upload/${token}`), 200);

  const capture = new FormData();
  capture.set("file", new File(["captura móvil sintética"], "captura-movil.txt", { type: "image/png" }));
  const captured = await jsonResponse(await fetch(`${app.origin}/api/mobile-upload/${token}`, {
    method: "POST",
    body: capture,
  }), 201);
  const capturedId = captured.file.id;
  const filesA = await jsonResponse(await ownedFetch(ownerA, "/api/files"), 200);
  const filesB = await jsonResponse(await ownedFetch(ownerB, "/api/files"), 200);
  assert.equal(filesA.files.some((file) => file.id === capturedId && file.origin === "QR móvil"), true);
  assert.equal(filesB.files.some((file) => file.id === capturedId), false);

  await jsonResponse(await ownedFetch(ownerA, "/api/mobile-sessions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: sessionId }),
  }), 200);
  await jsonResponse(await fetch(`${app.origin}/api/mobile-upload/${token}`), 410);
  await jsonResponse(await fetch(`${app.origin}/api/mobile-upload/${token}`, {
    method: "POST",
    body: capture,
  }), 410);
  await jsonResponse(await ownedFetch(ownerA, `/api/files/${capturedId}`, { method: "DELETE" }), 200);

  const unauthorizedImport = new FormData();
  unauthorizedImport.set("target", "epicrisis");
  unauthorizedImport.set("provider", "openai");
  const consentError = await jsonResponse(await ownedFetch(ownerA, "/api/ai/import", {
    method: "POST",
    body: unauthorizedImport,
  }), 400);
  assert.match(consentError.error, /autorización/);

  const invalidProvider = new FormData();
  invalidProvider.set("processingAuthorized", "true");
  invalidProvider.set("target", "epicrisis");
  invalidProvider.set("provider", "proveedor-inexistente");
  const providerError = await jsonResponse(await ownedFetch(ownerA, "/api/ai/import", {
    method: "POST",
    body: invalidProvider,
  }), 400);
  assert.match(providerError.error, /Proveedor de IA no permitido/);
});
