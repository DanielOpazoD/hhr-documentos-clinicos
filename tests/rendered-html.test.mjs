import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the clinical document workspace from a production product identity", async () => {
  await access(new URL("../dist/server/index.js", import.meta.url));
  const [layout, dashboard, packageJson, nodeVersion, product, constitution, readiness] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/Dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.nvmrc", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/product.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/PRODUCT_CONSTITUTION.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/PRODUCTION_READINESS.md", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /productIdentity\.name/);
  assert.match(product, /HHR-documentos/);
  assert.match(await readFile(new URL("../app/components/AppFrame.tsx", import.meta.url), "utf8"), /productIdentity\.name/);
  assert.match(product, /Centro privado para crear/);
  assert.match(dashboard, /Centro documental clínico/);
  assert.match(dashboard, /Cree, revise, imprima y respalde/);
  assert.match(constitution, /## Misión/);
  assert.match(constitution, /## Constitución de programación/);
  assert.match(readiness, /## Controles pendientes antes de uso clínico institucional/);
  assert.match(packageJson, /lucide-react/);
  assert.match(packageJson, /"node": ">=22\.13"/);
  assert.equal(nodeVersion.trim(), "22.13.0");
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
    "../app/api/ai/prompts/route.ts",
    "../app/api/ai/prompts/[id]/route.ts",
    "../app/api/ai/usage/route.ts",
    "../public/templates/laboratorio.pdf",
    "../public/templates/imagenologia.pdf",
    "../public/templates/encuesta-imagenologia.pdf",
    "../public/templates/consentimiento.pdf",
    "../public/hhr-logo.svg",
    "../public/og.png",
  ];
  await Promise.all(required.map(path => access(new URL(path, import.meta.url))));

  const [hosting, scanner, mobileCapture, scanProcessing, documentDetection, scanEnhancement, mobileUpload] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ScannerDesk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/MobileCapture.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/scan-processing.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/features/scanner/document-detection.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/features/scanner/scan-enhancement.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mobile-upload/[token]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(hosting, /"d1"\s*:\s*"DB"/);
  assert.match(hosting, /"r2"\s*:\s*"FILES"/);
  assert.match(scanner, /10 \* 60 \* 1000/);
  assert.match(mobileCapture, /getUserMedia/);
  assert.match(mobileCapture, /Editar bordes y estilo/);
  assert.match(mobileCapture, /Esquina \$\{index \+ 1\}/);
  assert.match(mobileCapture, /Detectar de nuevo/);
  assert.match(mobileCapture, /Blancura del papel/);
  assert.match(mobileCapture, /ImageCapture/);
  assert.match(scanProcessing, /renderScannedPage/);
  assert.match(scanProcessing, /uniform int u_filter/);
  assert.match(scanProcessing, /DEFAULT_SCAN_CORNERS/);
  assert.match(scanProcessing, /4200/);
  assert.match(documentDetection, /strongestLine/);
  assert.match(documentDetection, /detectDocumentCorners/);
  assert.match(scanEnhancement, /otsuThreshold/);
  assert.match(scanEnhancement, /enhanceScan/);
  assert.match(scanEnhancement, /high - low < 24/);
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
  const documentModules = [
    "../app/components/DocumentStudio.tsx",
    "../app/features/documents/DocumentCommandBar.tsx",
    "../app/features/documents/DocumentLibrary.tsx",
    "../app/features/documents/AiProvenance.tsx",
    "../app/features/documents/ai-metadata.ts",
    "../app/features/documents/PatientEditor.tsx",
    "../app/features/documents/DocumentPreview.tsx",
    "../app/features/documents/document-pdf.ts",
    "../app/lib/document-layout.ts",
    "../app/features/documents/SignatureEditor.tsx",
    "../app/features/documents/SignatureImageEditor.tsx",
    "../app/features/documents/SignatureProfileSelector.tsx",
    "../app/features/documents/prepare-signature.ts",
    "../app/features/documents/SectionsEditor.tsx",
    "../app/features/documents/templates.ts",
    "../app/features/documents/use-document-keyboard.ts",
    "../app/features/documents/use-document-identity.ts",
    "../app/features/documents/use-document-workspace.ts",
    "../app/features/documents/use-document-persistence.ts",
    "../app/features/documents/use-signature-workspace.ts",
    "../app/features/documents/api.ts",
    "../app/api/documents/route.ts",
    "../app/lib/client-pdf.ts",
  ];
  const [moduleSources, styles] = await Promise.all([
    Promise.all(documentModules.map((path) => readFile(new URL(path, import.meta.url), "utf8"))),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const documentStudio = moduleSources.join("\n");

  assert.match(documentStudio, /aria-label="Vista del documento"/);
  assert.match(documentStudio, /aria-controls="document-editor"/);
  assert.match(documentStudio, /aria-controls="document-preview"/);
  assert.match(documentStudio, /patient-manual-grid/);
  assert.match(documentStudio, /Fecha de nacimiento/);
  assert.match(documentStudio, /Profesional firmante/);
  assert.match(documentStudio, /Especialidad/);
  assert.doesNotMatch(documentStudio, /Previsión/);
  assert.match(documentStudio, /Perfil profesional/);
  assert.match(documentStudio, /Predeterminado/);
  assert.match(documentStudio, /makeDefaultSignature/);
  assert.match(documentStudio, /La firma se agrega después del contenido/);
  assert.match(documentStudio, /signature-placement-zone/);
  assert.match(documentStudio, /Fondo blanco automático/);
  assert.match(documentStudio, /renderSignatureImage/);
  assert.match(documentStudio, /brightness/);
  assert.match(documentStudio, /saturation/);
  assert.match(documentStudio, /addSection/);
  assert.match(documentStudio, /removeSection/);
  assert.match(documentStudio, /section-title-input/);
  assert.match(documentStudio, /Nueva sección/);
  assert.match(documentStudio, /recent-document-list/);
  assert.match(documentStudio, /aria-keyshortcuts="Control\+N Meta\+N"/);
  assert.match(documentStudio, /aria-keyshortcuts="Control\+S Meta\+S"/);
  assert.match(documentStudio, /event\.key === "Escape"/);
  assert.match(documentStudio, /event\.key === "Enter"/);
  assert.match(documentStudio, /id: "prescripcion", title: "Rp\."/);
  assert.doesNotMatch(documentStudio, /id: "medicamento"|id: "indicacion"/);
  assert.match(documentStudio, /api\/documents\?id=/);
  assert.match(documentStudio, /method: "DELETE"/);
  assert.match(documentStudio, /Confirmar eliminación de/);
  assert.match(documentStudio, /deleteDocument/);
  assert.match(documentStudio, /deleteDocuments/);
  assert.match(documentStudio, /selectedIds/);
  assert.match(documentStudio, /Todos/);
  assert.match(documentStudio, /deletedIds/);
  assert.match(documentStudio, /api\/signatures/);
  assert.match(documentStudio, /aiMetadata/);
  assert.match(documentStudio, /Ver trazabilidad/);
  assert.match(documentStudio, /Object\.fromEntries/);
  assert.match(documentStudio, /editedSectionIds/);
  assert.match(documentStudio, /legacyInsurance/);
  assert.match(documentStudio, /if \(placedSignature\) setPlacedSignature\(null\)/);
  assert.match(documentStudio, /professionalName: (?:snapshot\.)?placedSignature\.professionalName/);
  assert.match(documentStudio, /Servicio de Salud Metropolitano Oriente/);
  assert.match(documentStudio, /date: formatStoredDate\(input\.issueDate\)/);
  assert.match(documentStudio, /SIGNATURE_Y_MAX_PERCENT = 70/);
  assert.match(documentStudio, /defaultProfileApplied\.current = true/);
  assert.match(documentStudio, /markSignatureDirty/);
  assert.match(documentStudio, /workspaceEpoch/);
  assert.match(documentStudio, /flushPendingSave/);
  assert.match(documentStudio, /savePromise/);
  assert.match(documentStudio, /dirtyRef/);
  assert.match(documentStudio, /Math\.max\(width \/ 2, Math\.min\(100 - width \/ 2, current\.x\)\)/);
  assert.match(documentStudio, /event\.currentTarget\.value = ""/);
  assert.match(documentStudio, /signatureBlockHeight/);
  assert.equal(moduleSources.filter((source) => source.split("\n").length > 350).length, 0);
  assert.match(styles, /@media \(max-width: 1240px\)/);
  assert.match(styles, /\.simplified-studio \.document-editor-layout \{ grid-template-columns: 1fr; \}/);
  assert.match(styles, /\.document-editor-layout > \.mobile-hidden \{ display: none; \}/);
  assert.match(styles, /\.page-header > \*, \.hero-row > \*.*min-width: 0;/);
});

test("contains no production sample workflow or fictitious record creation", async () => {
  const [catalog, aiStudio, aiClient, connections, settings, layout, auth, clientPdf, headersConfig] = await Promise.all([
    readFile(new URL("../app/lib/catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AiStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/ai/client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/Connections.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/configuracion/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/page-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/client-pdf.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  ]);
  const productionSurface = [catalog, aiStudio, aiClient, connections, settings, layout, auth, clientPdf].join("\n");
  assert.doesNotMatch(productionSurface, /Paciente ficticio|Modo demostración|Ver ejemplo|Prototipo de evaluación|Simulación de IA|Dra\. Valentina Rojas/i);
  assert.match(aiClient, /patientName,/);
  assert.match(aiClient, /patient: result\.patient/);
  assert.match(aiClient, /signer: result\.signer/);
  assert.match(connections, /No configurado/);
  assert.doesNotMatch(settings, /Misión|Reducir la fricción administrativa|Unificar formularios/);
  assert.match(settings, /id: "conexiones"/);
  assert.match(settings, /id: "uso"/);
  assert.match(headersConfig, /X-Content-Type-Options/);
  assert.match(headersConfig, /Permissions-Policy/);
});

test("integrates connections and measured AI usage into tabbed settings", async () => {
  const [navigation, settings, redirect, dashboard, usageApi, usageStore, database, schema, migration] = await Promise.all([
    readFile(new URL("../app/components/AppFrame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/configuracion/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/conexiones/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/ai/AiUsageDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/usage/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/features/ai/server/usage.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/server/database.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_zippy_electro.sql", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(navigation, /href: "\/conexiones"/);
  assert.match(navigation, /mobile-settings-link/);
  assert.match(redirect, /redirect\("\/configuracion\?tab=conexiones"\)/);
  assert.match(settings, /PromptManager/);
  assert.match(settings, /Connections/);
  assert.match(settings, /AiUsageDashboard/);
  assert.match(settings, /SystemSettings/);
  assert.match(dashboard, /Costo estimado/);
  assert.match(dashboard, /Tokens/);
  assert.match(dashboard, /Modelo/);
  assert.match(dashboard, /No reemplaza la facturación del proveedor/);
  assert.match(usageApi, /GROUP BY provider_id, model/);
  assert.match(usageApi, /owner_email = \?/);
  assert.match(usageStore, /gpt-5\.6-sol/);
  assert.match(usageStore, /gpt-5-mini/);
  assert.match(usageStore, /estimated_cost_microusd/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS ai_usage_events/);
  assert.match(schema, /aiUsageEvents/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `ai_usage_events`/);
  assert.doesNotMatch(migration, /ALTER TABLE `signatures`/);
});

test("offers isolated OpenAI and local Gemma providers", async () => {
  const modules = await Promise.all([
    "../app/features/ai/server/providers.ts",
    "../app/features/ai/server/prompt.ts",
    "../app/features/ai/server/openai-responses.ts",
    "../app/features/ai/server/clinical-output.ts",
    "../app/features/ai/server/local-lm-studio.ts",
    "../app/features/ai/server/source-extraction.ts",
    "../app/features/ai/server/import-request.ts",
    "../app/features/ai/server/progress-stream.ts",
    "../app/features/ai/AiImportForm.tsx",
    "../app/features/ai/AiDraftResult.tsx",
    "../app/features/ai/AiIdentityEditor.tsx",
    "../app/features/ai/AiProcessingStatus.tsx",
    "../app/features/ai/use-ai-studio.ts",
    "../app/features/ai/client.ts",
    "../app/features/ai/prompt-client.ts",
    "../app/features/ai/PromptManager.tsx",
    "../app/features/ai/prompt-catalog.ts",
    "../app/features/ai/prompt-types.ts",
    "../app/features/ai/server/prompt-store.ts",
    "../app/features/ai/server/prompt-validation.ts",
    "../app/api/ai/providers/route.ts",
    "../app/api/ai/import/route.ts",
    "../app/api/ai/prompts/route.ts",
    "../app/api/ai/prompts/[id]/route.ts",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const source = modules.join("\n");
  assert.match(source, /hhr-gemma-local/);
  assert.match(source, /127\.0\.0\.1:1234/);
  assert.match(source, /provider-options/);
  assert.match(source, /Privado · sin salir del equipo/);
  assert.match(source, /getResolvedPDFJS/);
  assert.match(source, /loadingTask\.destroy/);
  assert.match(source, /MAX_PDF_PAGES/);
  assert.match(source, /MAX_DOCX_XML_BYTES/);
  assert.match(source, /UnzipInflate/);
  assert.match(source, /HHR_PAGE_/);
  assert.match(source, /\\u001e\\u001f/);
  assert.match(source, /form\.append\("files"/);
  assert.match(source, /application\/x-ndjson/);
  assert.match(source, /processing_summary/);
  assert.match(source, /identityConfirmed/);
  assert.match(source, /Datos de identidad revisados/);
  assert.match(source, /LOCAL_CONTEXT_TOKENS/);
  assert.match(source, /LOCAL_IMAGE_TOKEN_RESERVE/);
  assert.match(source, /MAX_BATCH_SIZE = 15 \* 1024 \* 1024/);
  assert.match(source, /Puede analizar hasta 8 archivos por vez\. Quite uno antes de agregar más\./);
  assert.match(source, /Prompts de documentos/);
  assert.match(source, /Duplicar para editar/);
  assert.match(source, /Usar por defecto/);
  assert.match(source, /clinical-draft-v4/);
  assert.match(source, /promptId/);
  assert.match(source, /promptInstructions/);
  assert.match(source, /Los prompts base no se pueden eliminar/);
  assert.doesNotMatch(source, /merged\.slice\(0, 8\)/);
  assert.match(source, /En toda fuente PDF, incluso escaneada, usa el número de página real del PDF/);
  assert.match(source, /sourceMimeType === "application\/pdf"\s*\? pageNumber === null/);
  assert.match(source, /MAX_IMAGE_PIXELS/);
  assert.match(source, /El DOCX contiene imágenes incrustadas/);
  assert.match(source, /documentId \? \{ id: documentId \}/);
  assert.match(source, /Actualizar borrador/);
  assert.match(source, /Configuración local inválida/);
  assert.match(source, /source_index/);
  assert.match(source, /const original = await sourceContent/);
  assert.match(source, /sourceIndex >= sourceCount/);
  assert.match(source, /pagesWithoutText/);
  assert.match(source, /getPdfPageCount/);
  assert.match(source, /invalidPage/);
  assert.match(source, /Paciente identificado/);
  assert.match(source, /Profesional firmante/);
  assert.match(source, /disabled=\{controller\.processing\}/);
  assert.doesNotMatch(source, /0\.0\.0\.0/);
});
