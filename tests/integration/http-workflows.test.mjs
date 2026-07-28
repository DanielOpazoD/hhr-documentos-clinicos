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
