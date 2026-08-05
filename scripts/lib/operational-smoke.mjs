import { validateReleaseManifest } from "./release-manifest.mjs";

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const OPERATIONAL_SMOKE_TIMEOUT_MS = 10_000;
const INVALID_AUTHORIZATION = ["Bearer", "hhr-operational-smoke-invalid-v1"].join(" ");
const ALTERNATE_INVALID_AUTHORIZATION = ["Bearer", "hhr-operational-smoke-invalid-v2"].join(" ");
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

async function withDeadline(label, timeoutMs, operation) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("El timeout del smoke operacional no es válido.");
  }
  const controller = new AbortController();
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} agotó el tiempo de espera del smoke operacional.`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    clearTimeout(timeout);
  }
}

function deploymentOrigin(value) {
  const url = new URL(value);
  const supportedProtocol = url.protocol === "https:" || url.protocol === "http:";
  const secureTransport = url.protocol === "https:" || LOOPBACK_HOSTS.has(url.hostname);
  if (!supportedProtocol || !secureTransport || url.username || url.password) {
    throw new Error("El origen del smoke test debe usar HTTPS; HTTP se admite solo en loopback y sin credenciales embebidas.");
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

function assertExpectedRelease(actual, expected) {
  if (
    actual.commit !== expected.commit
    || actual.schema !== expected.schema
    || actual.artifact.fingerprint !== expected.artifact.fingerprint
  ) {
    throw new Error("El release publicado no coincide con el artefacto esperado.");
  }
}

async function readPublishedRelease({ base, headers, fetchImpl, timeoutMs }) {
  return withDeadline("El release", timeoutMs, async (signal) => {
    const response = await fetchImpl(new URL("/release.json", base), {
      method: "GET",
      headers,
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      throw new Error(`No se pudo leer el release publicado (${response.status}).`);
    }
    return validateReleaseManifest(await jsonResponse(response, "El release"));
  });
}

async function assertInvalidAuthorizationRejected({ authorization, base, fetchImpl, timeoutMs }) {
  const invalidAuthorization = authorization === INVALID_AUTHORIZATION
    ? ALTERNATE_INVALID_AUTHORIZATION
    : INVALID_AUTHORIZATION;
  await withDeadline("La sonda de autenticación negativa", timeoutMs, async (signal) => {
    const response = await fetchImpl(
      new URL(`/api/files/${crypto.randomUUID()}`, base),
      {
        method: "GET",
        headers: new Headers({
          accept: "application/json",
          authorization: invalidAuthorization,
        }),
        cache: "no-store",
        signal,
      },
    );
    if (response.status !== 401) {
      throw new Error("La credencial sintética inválida no fue rechazada de forma inequívoca.");
    }
  });
}

export async function runOperationalSmoke({
  origin,
  authorization = "",
  expectedRelease,
  fetchImpl = fetch,
  timeoutMs = OPERATIONAL_SMOKE_TIMEOUT_MS,
}) {
  const base = deploymentOrigin(origin);
  const expected = validateReleaseManifest(expectedRelease);
  if (expected.sourceDirty) throw new Error("El release esperado declara una fuente no confirmada.");
  const headers = new Headers({ accept: "application/json" });
  if (authorization) headers.set("authorization", authorization);

  if (authorization) {
    await assertInvalidAuthorizationRejected({ authorization, base, fetchImpl, timeoutMs });
  }

  const release = await readPublishedRelease({ base, headers, fetchImpl, timeoutMs });
  if (release.sourceDirty) throw new Error("El release publicado declara una fuente no confirmada.");
  assertExpectedRelease(release, expected);

  const { probeResponse, probe } = await withDeadline(
    "La sonda operacional",
    timeoutMs,
    async (signal) => {
      const probeResponse = await fetchImpl(
        new URL(`/api/files/${crypto.randomUUID()}`, base),
        { method: "GET", headers, cache: "no-store", signal },
      );
      return {
        probeResponse,
        probe: await jsonResponse(probeResponse, "La sonda operacional"),
      };
    },
  );
  const requestId = probeResponse.headers.get("x-request-id");
  const expectedProbeResult = authorization
    ? probeResponse.status === 404 && probe.code === "NOT_FOUND"
    : (probeResponse.status === 401 && probe.code === "AUTH_REQUIRED")
      || (probeResponse.status === 404 && probe.code === "NOT_FOUND");
  if (
    !REQUEST_ID_PATTERN.test(requestId ?? "")
    || probe.requestId !== requestId
    || !expectedProbeResult
  ) {
    throw new Error("La sonda no devolvió un código de soporte operacional válido.");
  }

  const confirmedRelease = await readPublishedRelease({ base, headers, fetchImpl, timeoutMs });
  if (confirmedRelease.sourceDirty) throw new Error("El release publicado declara una fuente no confirmada.");
  assertExpectedRelease(confirmedRelease, expected);

  return {
    smokeVersion: 1,
    ok: true,
    requestId,
    route: "files.id.GET",
    status: probeResponse.status,
    code: probe.code,
    release: {
      manifestVersion: confirmedRelease.manifestVersion,
      commit: confirmedRelease.commit,
      schema: confirmedRelease.schema,
      artifactFingerprint: confirmedRelease.artifact.fingerprint,
    },
  };
}
