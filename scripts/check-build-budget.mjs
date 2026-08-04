import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL("../dist/client/", import.meta.url));
const assetRoot = join(clientRoot, "assets");
const manifestPath = join(clientRoot, ".vite", "manifest.json");
const deferredPdfPath = join(clientRoot, "vendor", "jspdf.umd.min.js");
const documentsEntryKey = "app/components/DocumentStudio.tsx";
const assistantEntryKey = "app/components/AiStudio.tsx";
const templateSettingsEntryKey = "app/features/documents/TemplateSettingsEditor.tsx";
const maxTotalBytes = 650_000;
const maxSingleAssetBytes = 220_000;
const maxDeferredPdfBytes = 425_000;
const maxDeferredAssistantBytes = 70_000;
const maxDeferredTemplateSettingsBytes = 7_000;
const routeBudgets = [
  { label: "Shell", entry: "virtual:vinext-app-browser-entry", maxBytes: 365_000 },
  { label: "Inicio", entry: "app/components/Dashboard.tsx", maxBytes: 390_000 },
  { label: "Documentos", entry: documentsEntryKey, maxBytes: 475_000 },
  { label: "Escáner", entry: "app/components/ScannerDesk.tsx", maxBytes: 335_000 },
  { label: "Archivos", entry: "app/components/FilesLibrary.tsx", maxBytes: 307_000 },
];

async function assetFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return assetFiles(path);
    return /\.(?:css|js)$/.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

const files = await assetFiles(assetRoot);
if (!files.length) throw new Error("No se encontraron artefactos JS/CSS. Ejecute el build antes de validar el presupuesto.");

const measured = await Promise.all(files.map(async (path) => ({
  path,
  bytes: (await stat(path)).size,
})));
const totalBytes = measured.reduce((total, asset) => total + asset.bytes, 0);
const largest = measured.toSorted((left, right) => right.bytes - left.bytes)[0];
const displayPath = relative(clientRoot, largest.path);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const manifestByFile = new Map(Object.values(manifest).map((entry) => [entry.file, entry]));
const manifestCssFiles = new Set(Object.values(manifest).flatMap((entry) => entry.css ?? []));
const sharedCssFiles = new Set(measured
  .filter((asset) => asset.path.endsWith(".css"))
  .map((asset) => relative(clientRoot, asset.path))
  .filter((file) => !manifestCssFiles.has(file)));
const deferredPdfBytes = (await stat(deferredPdfPath)).size;

function entryAssets(entryKey) {
  const entry = manifest[entryKey];
  if (!entry) throw new Error(`No se encontró ${entryKey} en el manifiesto del cliente.`);
  const visitedEntries = new Set();
  const assets = new Set();

  function visit(current) {
    if (!current || visitedEntries.has(current.file)) return;
    visitedEntries.add(current.file);
    assets.add(current.file);
    for (const cssFile of current.css ?? []) assets.add(cssFile);
    for (const importKey of current.imports ?? []) {
      visit(manifest[importKey] ?? manifestByFile.get(importKey));
    }
  }

  visit(entry);
  return assets;
}

async function filesBytes(files) {
  return (await Promise.all(
    [...files].map(async (file) => (await stat(join(clientRoot, file))).size),
  )).reduce((total, bytes) => total + bytes, 0);
}

function routeAssets(entryKey) {
  return new Set([...sharedCssFiles, ...entryAssets(entryKey)]);
}

const measuredRoutes = await Promise.all(routeBudgets.map(async (route) => {
  const assets = routeAssets(route.entry);
  return { ...route, assets, bytes: await filesBytes(assets) };
}));
const documentsEntry = manifest[documentsEntryKey];
const assistantEntry = manifest[assistantEntryKey];
const templateSettingsEntry = manifest[templateSettingsEntryKey];
if (!assistantEntry || !documentsEntry?.dynamicImports?.includes(assistantEntryKey)) {
  throw new Error("El asistente IA debe permanecer como importación dinámica de Documentos.");
}
if (!templateSettingsEntry || !documentsEntry.dynamicImports?.includes(templateSettingsEntryKey)) {
  throw new Error("La configuración de plantillas debe permanecer como importación dinámica de Documentos.");
}
if (!documentsEntry.css?.length) {
  throw new Error("Los estilos propios de Documentos deben pertenecer a su entrada en el manifiesto.");
}
const documentCssFiles = new Set(documentsEntry.css);
for (const route of measuredRoutes.filter((route) => route.entry !== documentsEntryKey)) {
  if ([...documentCssFiles].some((file) => route.assets.has(file))) {
    throw new Error(`La ruta ${route.label} carga estilos propios de Documentos.`);
  }
}
const documentsAssets = entryAssets(documentsEntryKey);
if (documentsAssets.has(assistantEntry.file)) {
  throw new Error("El asistente IA forma parte de la carga inicial de Documentos.");
}
if (documentsAssets.has(templateSettingsEntry.file)) {
  throw new Error("La configuración de plantillas forma parte de la carga inicial de Documentos.");
}
const assistantAssets = entryAssets(assistantEntryKey);
const deferredAssistantAssets = new Set([...assistantAssets].filter((file) => !documentsAssets.has(file)));
const deferredAssistantBytes = await filesBytes(deferredAssistantAssets);
const templateSettingsAssets = entryAssets(templateSettingsEntryKey);
const deferredTemplateSettingsAssets = new Set([...templateSettingsAssets].filter((file) => !documentsAssets.has(file)));
const deferredTemplateSettingsBytes = await filesBytes(deferredTemplateSettingsAssets);
const sharedCssBytes = await filesBytes(sharedCssFiles);

console.log(`Client JS/CSS: ${totalBytes} / ${maxTotalBytes} bytes`);
console.log(`Largest asset: ${displayPath} (${largest.bytes} / ${maxSingleAssetBytes} bytes)`);
console.log(`Shared CSS: ${sharedCssBytes} bytes`);
for (const route of measuredRoutes) {
  console.log(`Route ${route.label}: ${route.bytes} / ${route.maxBytes} bytes`);
}
console.log(`Deferred jsPDF: ${deferredPdfBytes} / ${maxDeferredPdfBytes} bytes`);
console.log(`Deferred assistant: ${deferredAssistantBytes} / ${maxDeferredAssistantBytes} bytes`);
console.log(`Deferred template settings: ${deferredTemplateSettingsBytes} / ${maxDeferredTemplateSettingsBytes} bytes`);

if (totalBytes > maxTotalBytes) {
  throw new Error(`El total JS/CSS supera el presupuesto por ${totalBytes - maxTotalBytes} bytes.`);
}
if (largest.bytes > maxSingleAssetBytes) {
  throw new Error(`El artefacto ${displayPath} supera el presupuesto por ${largest.bytes - maxSingleAssetBytes} bytes.`);
}
for (const route of measuredRoutes) {
  if (route.bytes > route.maxBytes) {
    throw new Error(`La ruta ${route.label} supera el presupuesto por ${route.bytes - route.maxBytes} bytes.`);
  }
}
if (deferredPdfBytes > maxDeferredPdfBytes) {
  throw new Error(`El generador PDF diferido supera el presupuesto por ${deferredPdfBytes - maxDeferredPdfBytes} bytes.`);
}
if (deferredAssistantBytes > maxDeferredAssistantBytes) {
  throw new Error(`El asistente IA diferido supera el presupuesto por ${deferredAssistantBytes - maxDeferredAssistantBytes} bytes.`);
}
if (deferredTemplateSettingsBytes > maxDeferredTemplateSettingsBytes) {
  throw new Error(`La configuración de plantillas diferida supera el presupuesto por ${deferredTemplateSettingsBytes - maxDeferredTemplateSettingsBytes} bytes.`);
}
