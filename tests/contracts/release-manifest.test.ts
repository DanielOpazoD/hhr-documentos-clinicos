import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  fingerprintArtifact,
  fingerprintSitesArchive,
  resolveSourceIdentity,
  validateReleaseIdentity,
  validateReleaseManifest,
} from "../../scripts/lib/release-manifest.mjs";

const execFileAsync = promisify(execFile);

test("fingerprints the complete deployable artifact deterministically and ignores only its own manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "hhr-release-"));
  try {
    await mkdir(join(root, "client", "assets"), { recursive: true });
    await mkdir(join(root, "server"));
    await mkdir(join(root, ".openai"));
    await writeFile(join(root, "client", "index.html"), "contenido estable");
    await writeFile(join(root, "client", "assets", "app.js"), "console.log('estable')");
    await writeFile(join(root, "server", "index.js"), "export default { fetch() {} }");
    await writeFile(join(root, ".openai", "release-identity.json"), JSON.stringify({ commit: "a".repeat(40) }));
    const initial = await fingerprintArtifact(root);
    assert.equal(initial.fileCount, 4);

    await writeFile(join(root, "client", "release.json"), "manifiesto fuera de la huella");
    assert.deepEqual(await fingerprintArtifact(root), initial);

    await writeFile(join(root, ".openai", "release-identity.json"), JSON.stringify({ commit: "b".repeat(40) }));
    assert.notEqual((await fingerprintArtifact(root)).fingerprint, initial.fingerprint);
    await writeFile(join(root, "server", "index.js"), "export default { fetch() { return 'alterado'; } }");
    assert.notEqual((await fingerprintArtifact(root)).fingerprint, initial.fingerprint);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("binds the packaged Sites archive to the normalized deployable artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "hhr-release-package-"));
  const archiveRoot = await mkdtemp(join(tmpdir(), "hhr-release-tar-"));
  try {
    const artifactRoot = join(root, "dist");
    await mkdir(join(artifactRoot, "client"), { recursive: true });
    await mkdir(join(artifactRoot, "server"));
    await mkdir(join(artifactRoot, ".openai"));
    await writeFile(join(artifactRoot, "client", "index.html"), "cliente verificado");
    await writeFile(join(artifactRoot, "server", "index.js"), "worker verificado");
    await writeFile(join(artifactRoot, ".openai", "release-identity.json"), JSON.stringify({ commit: "a".repeat(40) }));
    const artifact = await fingerprintArtifact(artifactRoot);
    const manifest = {
      manifestVersion: 1,
      commit: "a".repeat(40),
      sourceDirty: false,
      schema: "0009_ai_trace_privacy",
      artifact,
    };
    await writeFile(join(artifactRoot, "client", "release.json"), JSON.stringify(manifest));
    const archivePath = join(archiveRoot, "site.tar.gz");
    await execFileAsync("tar", ["-czf", archivePath, "-C", root, "dist"]);
    assert.deepEqual(
      await fingerprintSitesArchive(archivePath, manifest),
      artifact,
    );

    await writeFile(join(artifactRoot, "client", "release.json"), JSON.stringify({
      ...manifest,
      commit: "b".repeat(40),
    }));
    const staleManifestArchivePath = join(archiveRoot, "site-with-stale-manifest.tar.gz");
    await execFileAsync("tar", ["-czf", staleManifestArchivePath, "-C", root, "dist"]);
    await assert.rejects(
      () => fingerprintSitesArchive(staleManifestArchivePath, manifest),
      /no coincide con el manifiesto verificado/,
    );
    await writeFile(join(artifactRoot, "client", "release.json"), JSON.stringify(manifest));

    await writeFile(join(artifactRoot, "server", "index.js"), "worker alterado después de empaquetar");
    assert.notEqual(
      (await fingerprintSitesArchive(archivePath, manifest)).fingerprint,
      (await fingerprintArtifact(artifactRoot)).fingerprint,
    );

    await symlink("server/index.js", join(artifactRoot, "worker-link"));
    const linkedArchivePath = join(archiveRoot, "site-with-link.tar.gz");
    await execFileAsync("tar", ["-czf", linkedArchivePath, "-C", root, "dist"]);
    await assert.rejects(
      () => fingerprintSitesArchive(linkedArchivePath, manifest),
      /enlaces u otros tipos/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(archiveRoot, { recursive: true, force: true });
  }
});

test("fails closed when a non-Git build cannot attest clean source", async () => {
  const root = await mkdtemp(join(tmpdir(), "hhr-release-source-"));
  try {
    const commit = "a".repeat(40);
    assert.equal((await resolveSourceIdentity(root, { HHR_RELEASE_SHA: commit, NODE_ENV: "test" })).sourceDirty, true);
    assert.equal((await resolveSourceIdentity(root, {
      HHR_RELEASE_SHA: commit,
      HHR_RELEASE_CLEAN: "1",
      NODE_ENV: "test",
    })).sourceDirty, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts only the bounded release metadata contract", () => {
  const manifest = validateReleaseManifest({
    manifestVersion: 1,
    commit: "a".repeat(40),
    sourceDirty: false,
    schema: "0009_ai_trace_privacy",
    artifact: {
      algorithm: "sha256",
      fingerprint: "b".repeat(64),
      fileCount: 12,
      bytes: 42_000,
    },
  });
  const serialized = JSON.stringify(manifest);
  assert.deepEqual(Object.keys(manifest).sort(), ["artifact", "commit", "manifestVersion", "schema", "sourceDirty"]);
  assert.doesNotMatch(serialized, /prompt|patient|rut|token|secret|email/i);
  assert.throws(() => validateReleaseManifest({ ...manifest, commit: "short" }), /commit válido/);
  assert.throws(() => validateReleaseManifest({ ...manifest, artifact: { ...manifest.artifact, fingerprint: "invalid" } }), /huella/);
  assert.throws(() => validateReleaseManifest({ ...manifest, unexpected: "no permitido" }), /campos no permitidos/);
  assert.throws(() => validateReleaseManifest({
    ...manifest,
    artifact: { ...manifest.artifact, patient: "no permitido" },
  }), /campos no permitidos/);
  assert.deepEqual(validateReleaseIdentity({
    manifestVersion: 1,
    commit: "a".repeat(40),
    sourceDirty: false,
    schema: "0009_ai_trace_privacy",
  }), {
    manifestVersion: 1,
    commit: "a".repeat(40),
    sourceDirty: false,
    schema: "0009_ai_trace_privacy",
  });
  assert.throws(() => validateReleaseIdentity({
    manifestVersion: 1,
    commit: "a".repeat(40),
    sourceDirty: true,
    schema: "0009_ai_trace_privacy",
  }), /fuente limpia/);
  assert.throws(() => validateReleaseIdentity({
    manifestVersion: 1,
    commit: "a".repeat(40),
    sourceDirty: false,
    schema: "0009_ai_trace_privacy",
    unexpected: "no permitido",
  }), /campos no permitidos/);
});
