import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL("../dist/client/", import.meta.url));
const assetRoot = join(clientRoot, "assets");
const maxTotalBytes = 715_000;
const maxSingleAssetBytes = 220_000;

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

console.log(`Client JS/CSS: ${totalBytes} / ${maxTotalBytes} bytes`);
console.log(`Largest asset: ${displayPath} (${largest.bytes} / ${maxSingleAssetBytes} bytes)`);

if (totalBytes > maxTotalBytes) {
  throw new Error(`El total JS/CSS supera el presupuesto por ${totalBytes - maxTotalBytes} bytes.`);
}
if (largest.bytes > maxSingleAssetBytes) {
  throw new Error(`El artefacto ${displayPath} supera el presupuesto por ${largest.bytes - maxSingleAssetBytes} bytes.`);
}
