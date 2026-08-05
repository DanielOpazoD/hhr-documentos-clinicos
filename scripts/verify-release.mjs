import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  fingerprintArtifact,
  fingerprintSitesArchive,
  readSchemaVersion,
  releaseIdentityPath,
  releaseManifestPath,
  resolveSourceIdentity,
  validateReleaseIdentity,
  validateReleaseManifest,
} from "./lib/release-manifest.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function resolvedPath(value, fallback) {
  const path = value ?? fallback;
  return isAbsolute(path) ? path : resolve(projectRoot, path);
}

const remoteUrl = option("--url");
const artifactRoot = resolvedPath(option("--artifact-root"), "dist");
const archiveOption = option("--archive");
const sitesContentHash = option("--sites-content-hash")?.toLowerCase();
const sitesCommitSha = option("--sites-commit-sha")?.toLowerCase();
const expectedShaOption = option("--expected-sha");
if (expectedShaOption && !/^[0-9a-f]{40}$/i.test(expectedShaOption)) {
  throw new Error("--expected-sha requiere un SHA completo de 40 caracteres.");
}
if (remoteUrl && (!archiveOption || !sitesContentHash || !sitesCommitSha)) {
  throw new Error("--url requiere --archive, --sites-content-hash y --sites-commit-sha obtenidos de la versión guardada en Sites.");
}
if (sitesContentHash && !/^sha256:[0-9a-f]{64}$/.test(sitesContentHash)) {
  throw new Error("--sites-content-hash requiere la huella SHA-256 informada por Sites.");
}
if (sitesCommitSha && !/^[0-9a-f]{40}$/.test(sitesCommitSha)) {
  throw new Error("--sites-commit-sha requiere el SHA completo informado por Sites.");
}

let manifest;
if (remoteUrl) {
  const url = new URL(remoteUrl);
  if (!url.pathname.endsWith("/release.json")) url.pathname = `${url.pathname.replace(/\/$/, "")}/release.json`;
  const headers = process.env.HHR_RELEASE_AUTHORIZATION
    ? { Authorization: process.env.HHR_RELEASE_AUTHORIZATION }
    : undefined;
  const response = await fetch(url, { cache: "no-store", headers });
  if (!response.ok) throw new Error(`No se pudo leer el manifiesto publicado (${response.status}).`);
  manifest = validateReleaseManifest(await response.json());
} else {
  manifest = validateReleaseManifest(JSON.parse(await readFile(releaseManifestPath(artifactRoot), "utf8")));
}

const expectedSha = expectedShaOption?.toLowerCase()
  ?? (await resolveSourceIdentity(projectRoot)).commit;
if (manifest.commit.toLowerCase() !== expectedSha) {
  throw new Error(`El artefacto corresponde a ${manifest.commit}, no al commit esperado ${expectedSha}.`);
}
if (sitesCommitSha && sitesCommitSha !== expectedSha) {
  throw new Error(`La versión guardada en Sites corresponde a ${sitesCommitSha}, no al commit esperado ${expectedSha}.`);
}
if (manifest.sourceDirty && !process.argv.includes("--allow-dirty")) {
  throw new Error("El artefacto se construyó con cambios sin confirmar.");
}

const [artifact, schema] = await Promise.all([
  fingerprintArtifact(artifactRoot),
  readSchemaVersion(projectRoot),
]);
const identity = validateReleaseIdentity(JSON.parse(await readFile(releaseIdentityPath(artifactRoot), "utf8")));
if (
  identity.commit.toLowerCase() !== manifest.commit.toLowerCase()
  || identity.schema !== manifest.schema
  || identity.sourceDirty !== manifest.sourceDirty
) {
  throw new Error("La identidad incluida en el artefacto no coincide con su manifiesto.");
}
if (artifact.fingerprint !== manifest.artifact.fingerprint || artifact.fileCount !== manifest.artifact.fileCount || artifact.bytes !== manifest.artifact.bytes) {
  throw new Error("La huella del artefacto no coincide con el manifiesto.");
}
if (schema !== manifest.schema) throw new Error(`El artefacto usa el esquema ${manifest.schema}, no ${schema}.`);

if (archiveOption && sitesContentHash) {
  const archivePath = resolvedPath(archiveOption);
  const archivedArtifact = await fingerprintSitesArchive(archivePath, manifest);
  if (
    archivedArtifact.fingerprint !== artifact.fingerprint
    || archivedArtifact.fileCount !== artifact.fileCount
    || archivedArtifact.bytes !== artifact.bytes
  ) {
    throw new Error("El archivo guardado en Sites no contiene el artefacto local validado.");
  }
  const archiveFile = await readFile(archivePath);
  const storedTar = archiveFile[0] === 0x1f && archiveFile[1] === 0x8b
    ? gunzipSync(archiveFile)
    : archiveFile;
  const archiveHash = `sha256:${createHash("sha256").update(storedTar).digest("hex")}`;
  if (archiveHash !== sitesContentHash) {
    throw new Error("La huella de la versión guardada en Sites no coincide con el archivo validado.");
  }
}

console.log(`Release verificado: ${manifest.commit.slice(0, 8)} · ${manifest.schema} · ${manifest.artifact.fingerprint.slice(0, 12)}`);
