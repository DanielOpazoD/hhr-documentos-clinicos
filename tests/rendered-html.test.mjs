import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the clinical document workspace without starter artifacts", async () => {
  await access(new URL("../dist/server/index.js", import.meta.url));
  const [layout, dashboard, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/Dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /HHR Documentos/);
  assert.match(layout, /Centro privado para crear/);
  assert.match(dashboard, /Centro documental clínico/);
  assert.match(dashboard, /Entorno privado · Datos ficticios/);
  assert.doesNotMatch(`${layout}${dashboard}${packageJson}`, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("ships the clinical routes, storage bindings and source templates", async () => {
  const required = [
    "../app/formularios/page.tsx",
    "../app/documentos/page.tsx",
    "../app/archivos/page.tsx",
    "../app/escaner/page.tsx",
    "../app/ia/page.tsx",
    "../app/conexiones/page.tsx",
    "../public/templates/laboratorio.pdf",
    "../public/templates/imagenologia.pdf",
    "../public/templates/encuesta-imagenologia.pdf",
    "../public/templates/consentimiento.pdf",
    "../public/hhr-logo.svg",
    "../public/og.png",
  ];
  await Promise.all(required.map(path => access(new URL(path, import.meta.url))));

  const [hosting, scanner, mobileUpload] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ScannerDesk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mobile-upload/[token]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(hosting, /"d1"\s*:\s*"DB"/);
  assert.match(hosting, /"r2"\s*:\s*"FILES"/);
  assert.match(scanner, /10 \* 60 \* 1000/);
  assert.match(mobileUpload, /15 \* 1024 \* 1024/);
  assert.match(mobileUpload, /FILES\.put/);
});
