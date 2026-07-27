import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { createHospitalSalvadorDocxBytes } from "../app/features/ai/hospital-salvador-docx.js";
import { hospitalSalvadorFields } from "../app/features/ai/hospital-salvador-fields.js";

test("builds the clinical document workspace from a production product identity", async () => {
  await access(new URL("../dist/server/index.js", import.meta.url));
  const [layout, dashboard, packageJson, nodeVersion, product, constitution, readiness, qualityWorkflow, buildBudget, databaseCheck] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/Dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.nvmrc", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/product.ts", import.meta.url), "utf8"),
    readFile(new URL("../docs/PRODUCT_CONSTITUTION.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/PRODUCTION_READINESS.md", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/quality.yml", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-build-budget.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-database-state.mjs", import.meta.url), "utf8"),
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
  assert.match(packageJson, /"typecheck": "tsc --noEmit"/);
  assert.match(packageJson, /"verify":/);
  assert.match(packageJson, /node scripts\/check-database-state\.mjs/);
  assert.match(qualityWorkflow, /npm run verify/);
  assert.match(buildBudget, /maxTotalBytes/);
  assert.match(databaseCheck, /mkdtemp/);
  assert.match(databaseCheck, /directorySnapshot/);
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
    "../public/templates/formato-informe-traslado-hospital-salvador.docx",
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
    "../app/features/documents/DocumentHistoryDialog.tsx",
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
    "../app/features/documents/use-document-history.ts",
    "../app/features/documents/use-document-persistence.ts",
    "../app/features/documents/use-signature-workspace.ts",
    "../app/features/documents/api.ts",
    "../app/features/documents/document-version.ts",
    "../app/api/documents/route.ts",
    "../app/api/documents/[id]/versions/route.ts",
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
  assert.match(documentStudio, /removeSignatureProfile/);
  assert.match(documentStudio, /deleteSignature/);
  assert.match(documentStudio, /Eliminar perfil/);
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
  assert.match(documentStudio, /Historial del documento/);
  assert.match(documentStudio, /Restaurar una versión no elimina el historial/);
  assert.match(documentStudio, /restoreDocumentVersion/);
  assert.match(documentStudio, /expectedUpdatedAt/);
  assert.match(documentStudio, /otra pestaña/);
  assert.match(documentStudio, /Descartar cambios y recargar/);
  assert.match(documentStudio, /"restored"/);
  assert.match(documentStudio, /snapshot_json IS NOT NULL/);
  assert.match(documentStudio, /archivedVersion/);
  assert.match(documentStudio, /historyRequest/);
  assert.match(documentStudio, /restoreRequestActive/);
  assert.match(documentStudio, /closeDocumentHistory/);
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
  assert.doesNotMatch(await readFile(new URL("../app/features/documents/DocumentPreview.tsx", import.meta.url), "utf8"), /<h3>Paciente<\/h3>/);
  assert.doesNotMatch(await readFile(new URL("../app/features/documents/PatientEditor.tsx", import.meta.url), "utf8"), /<h2>Paciente<\/h2>/);
  assert.match(await readFile(new URL("../app/features/documents/document-pdf.ts", import.meta.url), "utf8"), /title: "",\s*body: `Nombre:/);
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
    "../app/features/ai/server/openai-models.ts",
    "../app/features/ai/server/prompt.ts",
    "../app/features/ai/server/openai-responses.ts",
    "../app/features/ai/server/clinical-output.ts",
    "../app/features/ai/server/local-lm-studio.ts",
    "../app/features/ai/server/source-extraction.ts",
    "../app/features/ai/server/import-request.ts",
    "../app/features/ai/server/source-policy.ts",
    "../app/features/ai/server/progress-stream.ts",
    "../app/features/ai/AiImportForm.tsx",
    "../app/features/ai/AiModelPicker.tsx",
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
  assert.match(source, /DEFAULT_OPENAI_MODEL = "gpt-5-mini"/);
  assert.match(source, /gpt-5\.6-terra/);
  assert.match(source, /gpt-5\.6-sol/);
  assert.match(source, /gpt-5\.6-luna/);
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/models/);
  assert.match(source, /ai-model-field/);
  assert.match(source, /Buscar modelo/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /supportsReasoning/);
  assert.match(source, /hhr\.ai-selection\.v1/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /form\.set\("model", model\)/);
  assert.match(source, /Modelo de OpenAI no permitido/);
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
  assert.match(source, /MAX_SOURCE_BATCH_SIZE = 15 \* 1024 \* 1024/);
  assert.match(source, /Puede analizar hasta 8 archivos por vez\. Quite uno antes de agregar más\./);
  assert.match(source, /Prompts de documentos/);
  assert.match(source, /Duplicar para editar/);
  assert.match(source, /Usar por defecto/);
  assert.match(source, /clinical-draft-v5/);
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

test("organizes, archives and deletes stored files through owned server routes", async () => {
  const modules = await Promise.all([
    "../app/components/FilesLibrary.tsx",
    "../app/features/files/FileCard.tsx",
    "../app/features/files/FileDialogs.tsx",
    "../app/features/files/FilesToolbar.tsx",
    "../app/features/files/use-files-library.ts",
    "../app/features/files/client.ts",
    "../app/features/files/server/delete-files.ts",
    "../app/api/files/route.ts",
    "../app/api/files/[id]/route.ts",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const source = modules.join("\n");
  assert.match(source, /Más recientes/);
  assert.match(source, /Todos visibles/);
  assert.match(source, /Eliminar.*archivo/s);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /status = 'eliminado'/);
  assert.match(source, /FILES\.delete/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /cleanupPendingFileDeletes/);
  assert.match(source, /owner_email = \?/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /onSubmit=/);
  assert.match(source, /aria-keyshortcuts="Enter"/);
  assert.match(source, /deleteOwnedFiles/);
  assert.equal(modules.filter((module) => module.split("\n").length > 220).length, 0);
});

test("ships the eight reviewed clinical prompts as configurable defaults", async () => {
  const promptFiles = [
    "epicrisis-prompt.ts",
    "acute-transfer-prompt.ts",
    "medical-report-prompt.ts",
    "medical-certificate-prompt.ts",
    "telegastro-prompt.ts",
    "telenephrology-prompt.ts",
    "telerheumatology-prompt.ts",
    "hospital-salvador-transfer-prompt.ts",
  ];
  const [catalog, targets, importForm, promptSchema, prompts] = await Promise.all([
    readFile(new URL("../app/features/ai/prompt-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/features/ai/targets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/features/ai/AiImportForm.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/ai/server/prompt.ts", import.meta.url), "utf8"),
    Promise.all(promptFiles.map((file) => readFile(new URL(`../app/features/ai/prompts/${file}`, import.meta.url), "utf8"))),
  ]);

  assert.equal((catalog.match(/id: "builtin-/g) ?? []).length, 8);
  assert.match(catalog, /clinical-draft-v5/);
  for (const target of ["epicrisis", "traslado_agudo", "informe_medico", "certificado", "tele_gastro", "tele_nefro", "tele_reumato", "traslado_salvador"]) {
    assert.match(targets, new RegExp(`id: "${target}"`));
  }
  for (const prompt of prompts) assert.ok(prompt.length > 6_000, "reviewed prompt is present in full");
  assert.match(prompts[0], /EPICRISIS MÉDICA/);
  assert.match(prompts[4], /TELEGASTROENTEROLOGÍA/);
  assert.match(prompts[7], /Hospital del Salvador/);
  assert.match(importForm, /aiTargetGroups/);
  assert.match(importForm, /Formulario oficial/);
  assert.match(importForm, /La IA completa sus 18 campos/);
  assert.match(promptSchema, /sectionSchema\(target/);
  assert.match(promptSchema, /minItems: hospitalSalvador \? hospitalSalvadorFields\.length : 1/);
  assert.match(promptSchema, /maxItems: hospitalSalvador \? hospitalSalvadorFields\.length : 12/);
  assert.match(promptSchema, /No infieras AUGE/);
  assert.match(promptSchema, /no construyas una tendencia entre fórmulas distintas/);
  assert.match(promptSchema, /intervalo de referencia, unidad y método/);
  assert.match(promptSchema, /No agregues controles, tamizajes, plazos ni planes de seguimiento/);
  const clinicalOutput = await readFile(new URL("../app/features/ai/server/clinical-output.ts", import.meta.url), "utf8");
  assert.match(clinicalOutput, /los 18 campos únicos del formulario/);
  assert.match(clinicalOutput, /no consta\)\\s\*\[\.!\]\?\$/);
  const aiController = await readFile(new URL("../app/features/ai/use-ai-studio.ts", import.meta.url), "utf8");
  assert.match(aiController, /title, evidenceStale: true/);
  assert.match(aiController, /section\.key === "full_name"/);
  const database = await readFile(new URL("../app/lib/server/database.ts", import.meta.url), "utf8");
  assert.match(database, /migrateLegacyAiPromptTargets/);
  assert.match(database, /target_type = 'informe_medico'/);
});

test("fills the official Hospital del Salvador Word without changing its institutional parts", async () => {
  const template = new Uint8Array(await readFile(new URL("../public/templates/formato-informe-traslado-hospital-salvador.docx", import.meta.url)));
  assert.equal(createHash("sha256").update(template).digest("hex"), "c23e3517eb0626c2702c5404b4f5315d1adc4a260a3955a410395211d94f57b2");

  const sections = hospitalSalvadorFields.map((field, index) => ({
    key: field.key,
    title: field.label,
    text: `Contenido verificado ${index + 1}`,
  }));
  const previousTimeZone = process.env.TZ;
  let output;
  try {
    process.env.TZ = "Pacific/Easter";
    output = createHospitalSalvadorDocxBytes(
      template,
      sections,
      { firstNames: "Paciente", lastNames: "Control", rut: "11.111.111-1" },
      { name: "Dr. Daniel Opazo", rut: "17.752.753-K", specialty: "Medicina Interna" },
      new Date("2026-07-27T01:30:00Z"),
    );
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
  const sourcePackage = unzipSync(template);
  const outputPackage = unzipSync(output);

  assert.deepEqual(Object.keys(outputPackage).sort(), Object.keys(sourcePackage).sort());
  for (const [path, bytes] of Object.entries(sourcePackage)) {
    if (path === "word/document.xml") continue;
    assert.deepEqual(outputPackage[path], bytes, path);
  }

  const documentXml = strFromU8(outputPackage["word/document.xml"]);
  const headerXml = strFromU8(outputPackage["word/header1.xml"]);
  assert.match(documentXml, /Paciente Control/);
  assert.match(documentXml, /11\.111\.111-1/);
  assert.match(documentXml, /Contenido verificado 18/);
  assert.match(documentXml, /Dr\. Daniel Opazo/);
  assert.match(documentXml, /Fecha: 26-07-2026/);
  assert.match(documentXml, /w:pgSz w:w="12240" w:h="20160"/);
  assert.match(headerXml.replace(/<[^>]+>/g, ""), /DEPARTAMENTO GESTION DE CAMAS 2026/);
  assert.ok(outputPackage["word/media/image1.png"]);
  assert.ok(outputPackage["word/media/image2.png"]);

  const withoutIdentity = createHospitalSalvadorDocxBytes(
    template,
    sections,
    { firstNames: "", lastNames: "", rut: "" },
    { name: "Dr. Daniel Opazo", rut: "17.752.753-K", specialty: "Medicina Interna" },
    new Date("2026-07-26T12:00:00Z"),
  );
  const withoutIdentityXml = strFromU8(unzipSync(withoutIdentity)["word/document.xml"]);
  assert.doesNotMatch(withoutIdentityXml, /Contenido verificado [12]<\/w:t>/);
  assert.ok((withoutIdentityXml.match(/No consignado/g) ?? []).length >= 2);
});
