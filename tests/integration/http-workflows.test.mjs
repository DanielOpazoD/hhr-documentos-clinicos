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
  const response = await new Promise((resolve, reject) => {
    const request = httpRequest(`${app.origin}/api/documents`, {
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

  assert.equal(response.status, 401);
  assert.deepEqual(JSON.parse(response.body), { error: "Autenticación requerida." });
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "SAMEORIGIN");
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
