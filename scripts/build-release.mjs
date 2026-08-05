import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createReleaseManifest,
  readSchemaVersion,
  releaseIdentityPath,
  releaseManifestPath,
  resolveSourceIdentity,
} from "./lib/release-manifest.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const artifactRoot = join(projectRoot, "dist");
const vinextCli = join(projectRoot, "node_modules", "vinext", "dist", "cli.js");
const sourceBefore = await resolveSourceIdentity(projectRoot);
const schemaBefore = await readSchemaVersion(projectRoot);
if (sourceBefore.sourceDirty) {
  throw new Error("El build de publicación requiere un checkout Git limpio y confirmado.");
}

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [vinextCli, "build"], {
    cwd: projectRoot,
    env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
    stdio: "inherit",
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`El build terminó con ${signal ? `señal ${signal}` : `código ${code}`}.`));
  });
});

const sourceAfter = await resolveSourceIdentity(projectRoot);
const schemaAfter = await readSchemaVersion(projectRoot);
if (
  sourceAfter.sourceDirty
  || sourceAfter.commit !== sourceBefore.commit
  || schemaAfter !== schemaBefore
) {
  throw new Error("La fuente o el esquema cambiaron durante el build; descarte el artefacto y vuelva a ejecutar.");
}
await writeFile(releaseIdentityPath(artifactRoot), `${JSON.stringify({
  manifestVersion: 1,
  commit: sourceAfter.commit,
  sourceDirty: false,
  schema: schemaAfter,
}, null, 2)}\n`);
const manifest = await createReleaseManifest(projectRoot, artifactRoot);
await writeFile(releaseManifestPath(artifactRoot), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Release ${manifest.commit.slice(0, 8)} · esquema ${manifest.schema} · ${manifest.artifact.fingerprint.slice(0, 12)}`);
