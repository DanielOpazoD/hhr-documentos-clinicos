import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  assert.match(dashboard, /Cree, revise, imprima y respalde/);
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
    "../app/api/signatures/route.ts",
    "../app/api/signatures/[id]/route.ts",
    "../public/templates/laboratorio.pdf",
    "../public/templates/imagenologia.pdf",
    "../public/templates/encuesta-imagenologia.pdf",
    "../public/templates/consentimiento.pdf",
    "../public/hhr-logo.svg",
    "../public/og.png",
  ];
  await Promise.all(required.map(path => access(new URL(path, import.meta.url))));

  const [hosting, scanner, mobileCapture, scanProcessing, mobileUpload] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ScannerDesk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MobileCapture.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/scan-processing.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mobile-upload/[token]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(hosting, /"d1"\s*:\s*"DB"/);
  assert.match(hosting, /"r2"\s*:\s*"FILES"/);
  assert.match(scanner, /10 \* 60 \* 1000/);
  assert.match(mobileCapture, /getUserMedia/);
  assert.match(mobileCapture, /Editar bordes y estilo/);
  assert.match(mobileCapture, /Esquina \$\{index \+ 1\}/);
  assert.match(scanProcessing, /renderScannedPage/);
  assert.match(scanProcessing, /uniform int u_filter/);
  assert.match(scanProcessing, /DEFAULT_SCAN_CORNERS/);
  assert.match(mobileUpload, /15 \* 1024 \* 1024/);
  assert.match(mobileUpload, /FILES\.put/);
});

test("uses byte-identical PDFs from origin/main/Formularios", async () => {
  const expected = new Map([
    ["laboratorio.pdf", "0fabdedcf24914f00af09a99b30b7f4d4f7a66509671996dc771ff1c31219921"],
    ["imagenologia.pdf", "8561373bdbf0160dd0afb8e129148976513be83e403907a057ae3ef2a929c0c9"],
    ["encuesta-imagenologia.pdf", "dc59fb93bff9a2e3d9cd460e4767fa9aa07f31bd4c2186c3c5aa925bbe87cc0d"],
    ["consentimiento.pdf", "aa4f2679a437020e82f10f794ad9b74c812cd76c0e22f5a2ae1c7df875509cb2"],
  ]);
  for (const [fileName, digest] of expected) {
    const bytes = await readFile(new URL(`../public/templates/${fileName}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest, fileName);
  }

  const studio = await readFile(new URL("../app/components/FormsStudio.tsx", import.meta.url), "utf8");
  assert.match(studio, /className="official-pdf-frame"/);
  assert.match(studio, /forms-navigation/);
  assert.match(studio, /Descargar/);
  assert.doesNotMatch(studio, /GitHub|origin\/main|SHA-256|Sin campos inventados|Cómo utilizarlo/);
  assert.doesNotMatch(studio, /clinical-paper|downloadClinicalPdf|Prestaciones solicitadas/);
});

test("keeps the clinical studios usable from mobile through desktop", async () => {
  const [documentStudio, styles] = await Promise.all([
    readFile(new URL("../app/components/DocumentStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(documentStudio, /aria-label="Vista del documento"/);
  assert.match(documentStudio, /aria-controls="document-editor"/);
  assert.match(documentStudio, /aria-controls="document-preview"/);
  assert.match(documentStudio, /patient-manual-grid/);
  assert.match(documentStudio, /Fecha de nacimiento/);
  assert.match(documentStudio, /signature-library/);
  assert.match(documentStudio, /Arrastre la firma en la hoja/);
  assert.match(documentStudio, /recent-document-list/);
  assert.doesNotMatch(documentStudio, /<select/);
  assert.match(documentStudio, /api\/documents\?id=/);
  assert.match(documentStudio, /api\/signatures/);
  assert.match(styles, /@media \(max-width: 1240px\)/);
  assert.match(styles, /\.document-editor-layout > \.mobile-hidden \{ display: none; \}/);
  assert.match(styles, /\.page-header > \*, \.hero-row > \*.*min-width: 0;/);
});
