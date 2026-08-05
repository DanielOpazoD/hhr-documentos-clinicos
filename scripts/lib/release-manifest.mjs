import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const RELEASE_MANIFEST_FILE = "release.json";
export const RELEASE_MANIFEST_RELATIVE_PATH = `client/${RELEASE_MANIFEST_FILE}`;
export const RELEASE_IDENTITY_RELATIVE_PATH = ".openai/release-identity.json";
export const RELEASE_MANIFEST_VERSION = 1;

function normalizedRelativePath(root, path) {
  return relative(root, path).split(sep).join("/");
}

async function artifactFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return artifactFiles(root, path);
    if (!entry.isFile() || normalizedRelativePath(root, path) === RELEASE_MANIFEST_RELATIVE_PATH) return [];
    return [path];
  }));
  return files.flat().toSorted((left, right) => {
    const leftPath = normalizedRelativePath(root, left);
    const rightPath = normalizedRelativePath(root, right);
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
  });
}

export async function fingerprintArtifact(artifactRoot) {
  const files = await artifactFiles(artifactRoot);
  const hash = createHash("sha256");
  let bytes = 0;
  for (const path of files) {
    const content = await readFile(path);
    const file = normalizedRelativePath(artifactRoot, path);
    bytes += content.byteLength;
    hash.update(file);
    hash.update("\0");
    hash.update(String(content.byteLength));
    hash.update("\0");
    hash.update(content);
  }
  return {
    algorithm: "sha256",
    fingerprint: hash.digest("hex"),
    fileCount: files.length,
    bytes,
  };
}

function sameArtifact(left, right) {
  return left.algorithm === right.algorithm
    && left.fingerprint.toLowerCase() === right.fingerprint.toLowerCase()
    && left.fileCount === right.fileCount
    && left.bytes === right.bytes;
}

function sameManifest(left, right) {
  return left.manifestVersion === right.manifestVersion
    && left.commit.toLowerCase() === right.commit.toLowerCase()
    && left.sourceDirty === right.sourceDirty
    && left.schema === right.schema
    && sameArtifact(left.artifact, right.artifact);
}

export async function fingerprintSitesArchive(archivePath, expectedManifest) {
  const verifiedManifest = validateReleaseManifest(expectedManifest);
  const extractionRoot = await mkdtemp(join(tmpdir(), "hhr-release-archive-"));
  try {
    const listing = (await execFileAsync("tar", ["-tzf", archivePath])).stdout
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!listing.length || listing.some((entry) => {
      if (entry === "dist" || entry === "dist/") return false;
      if (!entry.startsWith("dist/")) return true;
      return entry.split("/").some((segment) => segment === ".." || segment === ".");
    })) {
      throw new Error("El archivo de Sites contiene rutas fuera de dist/.");
    }
    const detailedListing = (await execFileAsync("tar", ["-tvzf", archivePath])).stdout
      .split("\n")
      .filter(Boolean);
    if (
      detailedListing.length !== listing.length
      || detailedListing.some((entry) => entry[0] !== "-" && entry[0] !== "d")
    ) {
      throw new Error("El archivo de Sites contiene enlaces u otros tipos de entrada no permitidos.");
    }
    await execFileAsync("tar", ["-xzf", archivePath, "-C", extractionRoot]);
    const artifactRoot = join(extractionRoot, "dist");
    const archivedManifest = validateReleaseManifest(JSON.parse(
      await readFile(releaseManifestPath(artifactRoot), "utf8"),
    ));
    const archivedArtifact = await fingerprintArtifact(artifactRoot);
    if (!sameArtifact(archivedManifest.artifact, archivedArtifact)) {
      throw new Error("El manifiesto incluido en el archivo de Sites no identifica su artefacto.");
    }
    if (!sameManifest(archivedManifest, verifiedManifest)) {
      throw new Error("El manifiesto incluido en el archivo de Sites no coincide con el manifiesto verificado.");
    }
    return archivedArtifact;
  } finally {
    await rm(extractionRoot, { recursive: true, force: true });
  }
}

export async function readSchemaVersion(projectRoot) {
  const journal = JSON.parse(await readFile(join(projectRoot, "drizzle", "meta", "_journal.json"), "utf8"));
  const latest = Array.isArray(journal.entries) ? journal.entries.at(-1) : null;
  if (!latest || typeof latest.tag !== "string" || !latest.tag) {
    throw new Error("No se pudo resolver la versión de esquema desde Drizzle.");
  }
  return latest.tag;
}

function validCommit(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value.trim());
}

function hasExactKeys(value, expected) {
  const actual = Object.keys(value).toSorted();
  const required = [...expected].toSorted();
  return actual.length === required.length && actual.every((key, index) => key === required[index]);
}

async function gitOutput(projectRoot, args) {
  try {
    return (await execFileAsync("git", args, { cwd: projectRoot })).stdout.trim();
  } catch {
    return null;
  }
}

export async function resolveSourceIdentity(projectRoot, environment = process.env) {
  const providedCommit = [
    environment.HHR_RELEASE_SHA,
    environment.GITHUB_SHA,
    environment.CF_PAGES_COMMIT_SHA,
  ].find(Boolean)?.trim();
  if (providedCommit && !validCommit(providedCommit)) {
    throw new Error("La variable de commit de publicación no contiene un SHA completo válido.");
  }

  const gitCommit = await gitOutput(projectRoot, ["rev-parse", "HEAD"]);
  if (gitCommit && !validCommit(gitCommit)) throw new Error("Git devolvió un SHA no válido.");
  if (providedCommit && gitCommit && providedCommit.toLowerCase() !== gitCommit.toLowerCase()) {
    throw new Error("El commit declarado para publicación no coincide con el checkout construido.");
  }
  const commit = providedCommit ?? gitCommit;
  if (!commit) {
    throw new Error("No se pudo identificar el commit. Defina HHR_RELEASE_SHA al construir fuera de Git.");
  }

  const status = gitCommit
    ? await gitOutput(projectRoot, ["status", "--porcelain=v1", "--untracked-files=all"])
    : null;
  return {
    commit: commit.toLowerCase(),
    sourceDirty: status === null
      ? environment.HHR_RELEASE_CLEAN !== "1" || environment.HHR_RELEASE_DIRTY === "1"
      : status.length > 0,
  };
}

export async function createReleaseManifest(projectRoot, artifactRoot, environment = process.env) {
  const [source, schema, artifact] = await Promise.all([
    resolveSourceIdentity(projectRoot, environment),
    readSchemaVersion(projectRoot),
    fingerprintArtifact(artifactRoot),
  ]);
  return {
    manifestVersion: RELEASE_MANIFEST_VERSION,
    commit: source.commit,
    sourceDirty: source.sourceDirty,
    schema,
    artifact,
  };
}

export function validateReleaseManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("El manifiesto no es un objeto válido.");
  if (!hasExactKeys(value, ["manifestVersion", "commit", "sourceDirty", "schema", "artifact"])) {
    throw new Error("El manifiesto contiene campos no permitidos.");
  }
  if (value.manifestVersion !== RELEASE_MANIFEST_VERSION) throw new Error("La versión del manifiesto no es compatible.");
  if (!validCommit(value.commit)) throw new Error("El manifiesto no contiene un commit válido.");
  if (typeof value.sourceDirty !== "boolean") throw new Error("El manifiesto no declara el estado del código fuente.");
  if (typeof value.schema !== "string" || !value.schema) throw new Error("El manifiesto no contiene la versión de esquema.");
  const artifact = value.artifact;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) throw new Error("El manifiesto no contiene la huella del artefacto.");
  if (!hasExactKeys(artifact, ["algorithm", "fingerprint", "fileCount", "bytes"])) {
    throw new Error("La huella contiene campos no permitidos.");
  }
  if (artifact.algorithm !== "sha256" || !/^[0-9a-f]{64}$/i.test(artifact.fingerprint ?? "")) {
    throw new Error("La huella del artefacto no es válida.");
  }
  if (!Number.isSafeInteger(artifact.fileCount) || artifact.fileCount < 1) throw new Error("El conteo de archivos no es válido.");
  if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1) throw new Error("El tamaño del artefacto no es válido.");
  return value;
}

export function validateReleaseIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("La identidad del artefacto no es válida.");
  if (!hasExactKeys(value, ["manifestVersion", "commit", "sourceDirty", "schema"])) {
    throw new Error("La identidad contiene campos no permitidos.");
  }
  if (value.manifestVersion !== RELEASE_MANIFEST_VERSION) throw new Error("La identidad usa una versión no compatible.");
  if (!validCommit(value.commit)) throw new Error("La identidad no contiene un commit válido.");
  if (value.sourceDirty !== false) throw new Error("La identidad no corresponde a una fuente limpia.");
  if (typeof value.schema !== "string" || !value.schema) throw new Error("La identidad no contiene la versión de esquema.");
  return value;
}

export function releaseManifestPath(artifactRoot) {
  return join(artifactRoot, RELEASE_MANIFEST_RELATIVE_PATH);
}

export function releaseIdentityPath(artifactRoot) {
  return join(artifactRoot, RELEASE_IDENTITY_RELATIVE_PATH);
}
