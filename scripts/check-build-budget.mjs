import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL("../dist/client/", import.meta.url));
const assetRoot = join(clientRoot, "assets");
const manifestPath = join(clientRoot, ".vite", "manifest.json");
const deferredPdfPath = join(clientRoot, "vendor", "jspdf.umd.min.js");
const documentsEntryKey = "app/components/DocumentStudio.tsx";
const assistantEntryKey = "app/components/AiStudio.tsx";
const maxTotalBytes = 650_000;
const maxSingleAssetBytes = 220_000;
const maxDeferredPdfBytes = 425_000;
const maxDeferredAssistantBytes = 70_000;
const routeBudgets = [
  { label: "Shell", entry: "virtual:vinext-app-browser-entry", maxBytes: 385_000 },
  { label: "Inicio", entry: "app/components/Dashboard.tsx", maxBytes: 405_000 },
  { label: "Documentos", entry: documentsEntryKey, maxBytes: 478_000 },
  { label: "Escáner", entry: "app/components/ScannerDesk.tsx", maxBytes: 350_000 },
  { label: "Archivos", entry: "app/components/FilesLibrary.tsx", maxBytes: 320_000 },
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
const globalCssBytes = measured
  .filter((asset) => asset.path.endsWith(".css"))
  .reduce((total, asset) => total + asset.bytes, 0);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const manifestByFile = new Map(Object.values(manifest).map((entry) => [entry.file, entry]));
const deferredPdfBytes = (await stat(deferredPdfPath)).size;

async function entryFiles(entryKey) {
  const entry = manifest[entryKey];
  if (!entry) throw new Error(`No se encontró ${entryKey} en el manifiesto del cliente.`);
  const visited = new Set();

  async function visit(current) {
    if (!current || visited.has(current.file)) return;
    visited.add(current.file);
    await Promise.all((current.imports ?? []).map((importKey) => (
      visit(manifest[importKey] ?? manifestByFile.get(importKey))
    )));
  }

  await visit(entry);
  return visited;
}

async function filesBytes(files) {
  return (await Promise.all(
    [...files].map(async (file) => (await stat(join(clientRoot, file))).size),
  )).reduce((total, bytes) => total + bytes, 0);
}

async function routeBytes(entryKey) {
  const javascriptBytes = await filesBytes(await entryFiles(entryKey));
  return javascriptBytes + globalCssBytes;
}

const measuredRoutes = await Promise.all(routeBudgets.map(async (route) => ({
  ...route,
  bytes: await routeBytes(route.entry),
})));
const documentsEntry = manifest[documentsEntryKey];
const assistantEntry = manifest[assistantEntryKey];
if (!assistantEntry || !documentsEntry?.dynamicImports?.includes(assistantEntryKey)) {
  throw new Error("El asistente IA debe permanecer como importación dinámica de Documentos.");
}
const documentsFiles = await entryFiles(documentsEntryKey);
if (documentsFiles.has(assistantEntry.file)) {
  throw new Error("El asistente IA forma parte de la carga inicial de Documentos.");
}
const assistantFiles = await entryFiles(assistantEntryKey);
const deferredAssistantFiles = new Set([...assistantFiles].filter((file) => !documentsFiles.has(file)));
const deferredAssistantBytes = await filesBytes(deferredAssistantFiles);

console.log(`Client JS/CSS: ${totalBytes} / ${maxTotalBytes} bytes`);
console.log(`Largest asset: ${displayPath} (${largest.bytes} / ${maxSingleAssetBytes} bytes)`);
for (const route of measuredRoutes) {
  console.log(`Route ${route.label}: ${route.bytes} / ${route.maxBytes} bytes`);
}
console.log(`Deferred jsPDF: ${deferredPdfBytes} / ${maxDeferredPdfBytes} bytes`);
console.log(`Deferred assistant: ${deferredAssistantBytes} / ${maxDeferredAssistantBytes} bytes`);

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
