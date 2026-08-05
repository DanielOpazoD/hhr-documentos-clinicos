import { validateReleaseManifest } from "./release-manifest.mjs";

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPECTED_PROBE_CODES = new Set(["AUTH_REQUIRED", "NOT_FOUND"]);

function deploymentOrigin(value) {
  const url = new URL(value);
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new Error("El origen del smoke test debe ser una URL HTTP(S) sin credenciales embebidas.");
  }
  return url.origin;
}

async function jsonResponse(response, label) {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`${label} no devolvió JSON (${response.status}).`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} devolvió JSON no válido (${response.status}).`);
  }
}

export async function runOperationalSmoke({
  origin,
  authorization = "",
  fetchImpl = fetch,
}) {
  const base = deploymentOrigin(origin);
  const headers = new Headers({ accept: "application/json" });
  if (authorization) headers.set("authorization", authorization);

  const releaseResponse = await fetchImpl(new URL("/release.json", base), {
    method: "GET",
    headers,
    cache: "no-store",
  });
  if (!releaseResponse.ok) {
    throw new Error(`No se pudo leer el release publicado (${releaseResponse.status}).`);
  }
  const release = validateReleaseManifest(await jsonResponse(releaseResponse, "El release"));
  if (release.sourceDirty) throw new Error("El release publicado declara una fuente no confirmada.");

  const probeResponse = await fetchImpl(
    new URL(`/api/files/${crypto.randomUUID()}`, base),
    { method: "GET", headers, cache: "no-store" },
  );
  const probe = await jsonResponse(probeResponse, "La sonda operacional");
  const requestId = probeResponse.headers.get("x-request-id");
  if (
    !REQUEST_ID_PATTERN.test(requestId ?? "")
    || probe.requestId !== requestId
    || !EXPECTED_PROBE_CODES.has(probe.code)
    || (probeResponse.status !== 401 && probeResponse.status !== 404)
  ) {
    throw new Error("La sonda no devolvió un código de soporte operacional válido.");
  }

  return {
    smokeVersion: 1,
    ok: true,
    requestId,
    route: "files.id.GET",
    status: probeResponse.status,
    code: probe.code,
    release: {
      manifestVersion: release.manifestVersion,
      commit: release.commit,
      schema: release.schema,
      artifactFingerprint: release.artifact.fingerprint,
    },
  };
}
