import assert from "node:assert/strict";
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
  return app.fetch(path, { ...init, headers });
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

async function createMobileSession(owner) {
  return jsonResponse(await ownedFetch(owner, "/api/mobile-sessions", { method: "POST" }), 201);
}

function mobileUploadFetch(token, init = {}) {
  const { uploadId, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  headers.set("x-hhr-capture-token", token);
  if (requestInit.method === "POST") headers.set("x-hhr-upload-id", uploadId ?? crypto.randomUUID());
  return app.fetch("/api/mobile-upload", { ...requestInit, headers });
}

function mobileCapture(name, content = `captura sintética ${name}`) {
  const form = new FormData();
  form.set("file", new File([content], name, { type: "image/png" }));
  return form;
}

test("serves the critical private application routes", async () => {
  const routes = [
    ["/", "<title>Inicio · HHR-documentos</title>"],
    ["/documentos", "<title>Documentos · HHR-documentos</title>"],
    ["/ia", "<title>Asistente IA · HHR-documentos</title>"],
  ];

  for (const [path, title] of routes) {
    const response = await app.fetchPreview(path);
    assert.equal(response.status, 200, path);
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
    const response = await app.fetch(path, { method });
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.deepEqual(await response.json(), { error: "Autenticación requerida." });
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
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

test("keeps exactly one mobile capture session active per owner", async () => {
  const ownerA = `mobile-a-${crypto.randomUUID()}@hhr.test`;
  const ownerB = `mobile-b-${crypto.randomUUID()}@hhr.test`;
  const first = (await createMobileSession(ownerA)).session;
  const second = (await createMobileSession(ownerA)).session;
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.token, second.token);
  const remainingMs = Date.parse(second.expiresAt) - Date.now();
  assert.equal(remainingMs > 9 * 60 * 1000 && remainingMs <= 10 * 60 * 1000, true);
  await jsonResponse(await mobileUploadFetch(first.token), 410);
  const secondActive = await jsonResponse(await mobileUploadFetch(second.token), 200);
  assert.equal(secondActive.session.id, second.id);

  const foreignRead = await ownedFetch(ownerB, `/api/mobile-sessions?id=${second.id}`);
  await jsonResponse(foreignRead, 404);
  await jsonResponse(await jsonRequest(ownerB, "/api/mobile-sessions", "PATCH", { id: second.id }), 404);
  await jsonResponse(await mobileUploadFetch(second.token), 200);

  const invalidJson = await ownedFetch(ownerA, "/api/mobile-sessions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  await jsonResponse(invalidJson, 400);

  await jsonResponse(await jsonRequest(ownerA, "/api/mobile-sessions", "PATCH", { id: second.id }), 200);
  await jsonResponse(await jsonRequest(ownerA, "/api/mobile-sessions", "PATCH", { id: second.id }), 200);
  await jsonResponse(await mobileUploadFetch(second.token), 410);
  await jsonResponse(await mobileUploadFetch(second.token, {
    method: "POST",
    body: mobileCapture("captura-revocada.png"),
  }), 410);

  const concurrent = await Promise.all([createMobileSession(ownerA), createMobileSession(ownerA)]);
  const concurrentStatuses = await Promise.all(concurrent.map(({ session }) => mobileUploadFetch(session.token).then(response => response.status)));
  assert.deepEqual([...concurrentStatuses].sort((a, b) => a - b), [200, 410]);
  const activeIndex = concurrentStatuses.findIndex(status => status === 200);
  await jsonResponse(await jsonRequest(ownerA, "/api/mobile-sessions", "PATCH", { id: concurrent[activeIndex].session.id }), 200);
});

test("attributes mobile files to their exact session without origin spoofing", async () => {
  const ownerA = `mobile-files-a-${crypto.randomUUID()}@hhr.test`;
  const ownerB = `mobile-files-b-${crypto.randomUUID()}@hhr.test`;
  const first = (await createMobileSession(ownerA)).session;
  const firstCapture = await jsonResponse(await mobileUploadFetch(first.token, {
    method: "POST",
    body: mobileCapture("sesion-uno.png"),
  }), 201);

  const second = (await createMobileSession(ownerA)).session;
  const secondCapture = await jsonResponse(await mobileUploadFetch(second.token, {
    method: "POST",
    body: mobileCapture("sesion-dos.png"),
  }), 201);

  const spoofedUpload = new FormData();
  spoofedUpload.set("file", new File(["archivo de escritorio"], "escritorio.png", { type: "image/png" }));
  spoofedUpload.set("origin", "QR móvil");
  const desktopFile = await jsonResponse(await ownedFetch(ownerA, "/api/files", {
    method: "POST",
    body: spoofedUpload,
  }), 201);
  assert.equal(desktopFile.file.origin, "Escritorio");

  const firstView = await jsonResponse(await ownedFetch(ownerA, `/api/mobile-sessions?id=${first.id}`), 200);
  const secondView = await jsonResponse(await ownedFetch(ownerA, `/api/mobile-sessions?id=${second.id}`), 200);
  assert.equal(firstView.session.id, first.id);
  assert.equal(secondView.session.id, second.id);
  assert.deepEqual(firstView.files.map(file => file.id), [firstCapture.file.id]);
  assert.deepEqual(secondView.files.map(file => file.id), [secondCapture.file.id]);
  assert.equal(firstView.files[0].status, "activo");
  assert.equal(secondView.files[0].status, "activo");
  assert.equal(firstView.files.some(file => file.id === desktopFile.file.id), false);
  assert.equal(secondView.files.some(file => file.id === desktopFile.file.id), false);

  const ownerFiles = await jsonResponse(await ownedFetch(ownerA, "/api/files"), 200);
  const foreignFiles = await jsonResponse(await ownedFetch(ownerB, "/api/files"), 200);
  assert.equal(ownerFiles.files.some(file => file.id === firstCapture.file.id && file.origin === "QR móvil"), true);
  assert.equal(ownerFiles.files.some(file => file.id === secondCapture.file.id && file.origin === "QR móvil"), true);
  assert.equal(ownerFiles.files.every(file => file.status === "activo" || file.status === "archivado"), true);
  assert.equal(foreignFiles.files.some(file => file.id === firstCapture.file.id || file.id === secondCapture.file.id), false);

  await jsonResponse(await jsonRequest(ownerA, "/api/mobile-sessions", "PATCH", { id: second.id }), 200);
  await jsonResponse(await mobileUploadFetch(second.token), 410);
  await jsonResponse(await mobileUploadFetch(second.token, {
    method: "POST",
    body: mobileCapture("posterior-a-revocacion.png"),
  }), 410);
  await jsonResponse(await jsonRequest(ownerA, "/api/files", "DELETE", {
    ids: [firstCapture.file.id, secondCapture.file.id, desktopFile.file.id],
  }), 200);
});

test("caps each mobile session at eight stored files", async () => {
  const owner = `mobile-limit-${crypto.randomUUID()}@hhr.test`;
  const session = (await createMobileSession(owner)).session;
  const uploadedIds = [];
  const initial = await jsonResponse(await mobileUploadFetch(session.token), 200);
  assert.equal(initial.session.remainingFiles, 8);

  for (let index = 0; index < 8; index++) {
    const uploaded = await jsonResponse(await mobileUploadFetch(session.token, {
      method: "POST",
      body: mobileCapture(`limite-${index + 1}.png`),
    }), 201);
    uploadedIds.push(uploaded.file.id);
    assert.equal(uploaded.remainingFiles, 7 - index);
  }

  const rejected = await jsonResponse(await mobileUploadFetch(session.token, {
    method: "POST",
    body: mobileCapture("limite-9.png"),
  }), 409);
  assert.match(rejected.error, /hasta 8 archivos/);

  const snapshot = await jsonResponse(await ownedFetch(owner, `/api/mobile-sessions?id=${session.id}`), 200);
  assert.equal(snapshot.files.length, 8);
  assert.deepEqual(new Set(snapshot.files.map((file) => file.id)), new Set(uploadedIds));

  await jsonResponse(await jsonRequest(owner, "/api/files", "DELETE", { ids: uploadedIds }), 200);
  await jsonResponse(await jsonRequest(owner, "/api/mobile-sessions", "PATCH", { id: session.id }), 200);
});

test("deduplicates a mobile upload retried after its response is lost", async () => {
  const owner = `mobile-retry-${crypto.randomUUID()}@hhr.test`;
  const session = (await createMobileSession(owner)).session;
  const uploadId = crypto.randomUUID();

  const first = await jsonResponse(await mobileUploadFetch(session.token, {
    method: "POST",
    uploadId,
    body: mobileCapture("reintento.png"),
  }), 201);
  const retried = await jsonResponse(await mobileUploadFetch(session.token, {
    method: "POST",
    uploadId,
    body: mobileCapture("reintento.png"),
  }), 200);

  assert.equal(first.file.id, uploadId);
  assert.equal(retried.file.id, uploadId);
  assert.equal(first.remainingFiles, 7);
  assert.equal(retried.remainingFiles, 7);

  const snapshot = await jsonResponse(await ownedFetch(owner, `/api/mobile-sessions?id=${session.id}`), 200);
  assert.deepEqual(snapshot.files.map((file) => file.id), [uploadId]);

  await jsonResponse(await jsonRequest(owner, "/api/files", "DELETE", { ids: [uploadId] }), 200);
  const deletedRetry = await jsonResponse(await mobileUploadFetch(session.token, {
    method: "POST",
    uploadId,
    body: mobileCapture("reintento.png"),
  }), 409);
  assert.equal(deletedRetry.code, "upload_deleted");
  const deletedSnapshot = await jsonResponse(await ownedFetch(owner, `/api/mobile-sessions?id=${session.id}`), 200);
  assert.deepEqual(deletedSnapshot.files, []);
  await jsonResponse(await jsonRequest(owner, "/api/mobile-sessions", "PATCH", { id: session.id }), 200);
});

test("keeps the mobile capability out of HTTP paths and rendered HTML", async () => {
  const owner = `mobile-route-${crypto.randomUUID()}@hhr.test`;
  const session = (await createMobileSession(owner)).session;
  const page = await app.fetch("/captura");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert.match(page.headers.get("x-robots-tag") ?? "", /noindex/);
  const html = await page.text();
  assert.equal(html.includes(session.token), false);
  assert.equal(html.includes(`/api/mobile-upload/${session.token}`), false);
  assert.equal((await app.fetch(`/captura/${session.token}`)).status, 404);
  assert.equal((await app.fetch(`/api/mobile-upload/${session.token}`)).status, 404);
  const capabilityResponse = await mobileUploadFetch(session.token);
  assert.equal(capabilityResponse.headers.get("cache-control"), "no-store");
  assert.equal(capabilityResponse.headers.get("referrer-policy"), "no-referrer");
  assert.match(capabilityResponse.headers.get("x-robots-tag") ?? "", /noindex/);
  await jsonResponse(capabilityResponse, 200);
  await jsonResponse(await jsonRequest(owner, "/api/mobile-sessions", "PATCH", { id: session.id }), 200);
});

test("keeps AI import offline without authorization", async () => {
  const ownerA = `ai-import-${crypto.randomUUID()}@hhr.test`;

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
