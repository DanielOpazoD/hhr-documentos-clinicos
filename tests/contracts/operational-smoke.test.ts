import assert from "node:assert/strict";
import test from "node:test";
import { runOperationalSmoke } from "../../scripts/lib/operational-smoke.mjs";

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const privateHeader = ["Bearer", "synthetic-marker"].join(" ");
const release = {
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
};

test("runs a read-only synthetic post-deploy probe", async () => {
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  const result = await runOperationalSmoke({
    origin: "https://hhr.example.test/documentos?ignored=1",
    authorization: privateHeader,
    expectedRelease: release,
    fetchImpl: async (input: URL | RequestInfo, init: RequestInit = {}) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      if (url.pathname === "/release.json") return Response.json(release);
      return Response.json({
        error: "Archivo sintético no encontrado.",
        code: "NOT_FOUND",
        requestId,
      }, { status: 404, headers: { "x-request-id": requestId } });
    },
  });

  assert.equal(requests.length, 3);
  assert.equal(requests[0].url.pathname, "/release.json");
  assert.match(requests[1].url.pathname, /^\/api\/files\/[0-9a-f-]{36}$/);
  assert.equal(requests[2].url.pathname, "/release.json");
  for (const request of requests) {
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.body, undefined);
    assert.ok(request.init.signal instanceof AbortSignal);
    assert.equal(new Headers(request.init.headers).get("authorization"), privateHeader);
  }
  assert.deepEqual(result, {
    smokeVersion: 1,
    ok: true,
    requestId,
    route: "files.id.GET",
    status: 404,
    code: "NOT_FOUND",
    release: {
      manifestVersion: 1,
      commit: "a".repeat(40),
      schema: "0009_ai_trace_privacy",
      artifactFingerprint: "b".repeat(64),
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /credential|Archivo sintético|error|authorization/i);
});

test("fails closed when correlation or release integrity is missing", async () => {
  await assert.rejects(() => runOperationalSmoke({
    origin: "https://hhr.example.test",
    expectedRelease: release,
    fetchImpl: async (input: URL | RequestInfo) => {
      if (new URL(String(input)).pathname === "/release.json") {
        return Response.json({ ...release, sourceDirty: true });
      }
      throw new Error("the probe must not run");
    },
  }), /fuente no confirmada/);

  await assert.rejects(() => runOperationalSmoke({
    origin: "https://hhr.example.test",
    expectedRelease: release,
    fetchImpl: async (input: URL | RequestInfo) => {
      if (new URL(String(input)).pathname === "/release.json") return Response.json(release);
      return Response.json({ code: "NOT_FOUND", requestId: "different" }, { status: 404 });
    },
  }), /código de soporte operacional válido/);
});

test("requires exact authentication and not-found probe outcomes", async () => {
  async function probeResponse(
    authorization: string,
    status: number,
    code: string,
  ) {
    return runOperationalSmoke({
      origin: "https://hhr.example.test",
      authorization,
      expectedRelease: release,
      fetchImpl: async (input: URL | RequestInfo) => {
        if (new URL(String(input)).pathname === "/release.json") return Response.json(release);
        return Response.json({ code, requestId }, {
          status,
          headers: { "x-request-id": requestId },
        });
      },
    });
  }

  assert.equal((await probeResponse("", 401, "AUTH_REQUIRED")).ok, true);
  await assert.rejects(
    () => probeResponse(privateHeader, 401, "AUTH_REQUIRED"),
    /código de soporte operacional válido/,
  );
  await assert.rejects(
    () => probeResponse("", 401, "NOT_FOUND"),
    /código de soporte operacional válido/,
  );
  await assert.rejects(
    () => probeResponse("", 404, "AUTH_REQUIRED"),
    /código de soporte operacional válido/,
  );
});

test("bounds fetch and response parsing with a cancellable deadline", async () => {
  const observedSignals: AbortSignal[] = [];
  await assert.rejects(() => runOperationalSmoke({
    origin: "https://hhr.example.test",
    expectedRelease: release,
    timeoutMs: 5,
    fetchImpl: async (_input: URL | RequestInfo, init: RequestInit = {}) => {
      observedSignals.push(init.signal as AbortSignal);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => new Promise(() => undefined),
      } as Response;
    },
  }), /release agotó el tiempo de espera/i);
  assert.equal(observedSignals[0]?.aborted, true);
});

test("allows plaintext transport only for a loopback development origin", async () => {
  await assert.rejects(() => runOperationalSmoke({
    origin: "http://hhr.example.test",
    authorization: privateHeader,
    expectedRelease: release,
    fetchImpl: async () => { throw new Error("fetch must not run"); },
  }), /origen del smoke test/);
});

test("fails when the deployed release differs from the promoted artifact", async () => {
  let requests = 0;
  await assert.rejects(() => runOperationalSmoke({
    origin: "https://hhr.example.test",
    expectedRelease: release,
    fetchImpl: async () => {
      requests += 1;
      return Response.json({ ...release, commit: "c".repeat(40) });
    },
  }), /no coincide con el artefacto esperado/);
  assert.equal(requests, 1);
});

test("detects a release that changes while the probe is running", async () => {
  let releaseReads = 0;
  await assert.rejects(() => runOperationalSmoke({
    origin: "https://hhr.example.test",
    expectedRelease: release,
    fetchImpl: async (input: URL | RequestInfo) => {
      if (new URL(String(input)).pathname === "/release.json") {
        releaseReads += 1;
        return Response.json(releaseReads === 1
          ? release
          : { ...release, artifact: { ...release.artifact, fingerprint: "c".repeat(64) } });
      }
      return Response.json({ code: "NOT_FOUND", requestId }, {
        status: 404,
        headers: { "x-request-id": requestId },
      });
    },
  }), /no coincide con el artefacto esperado/);
  assert.equal(releaseReads, 2);
});
