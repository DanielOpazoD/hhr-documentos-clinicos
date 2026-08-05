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

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.pathname, "/release.json");
  assert.match(requests[1].url.pathname, /^\/api\/files\/[0-9a-f-]{36}$/);
  for (const request of requests) {
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.body, undefined);
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
    fetchImpl: async (input: URL | RequestInfo) => {
      if (new URL(String(input)).pathname === "/release.json") {
        return Response.json({ ...release, sourceDirty: true });
      }
      throw new Error("the probe must not run");
    },
  }), /fuente no confirmada/);

  await assert.rejects(() => runOperationalSmoke({
    origin: "https://hhr.example.test",
    fetchImpl: async (input: URL | RequestInfo) => {
      if (new URL(String(input)).pathname === "/release.json") return Response.json(release);
      return Response.json({ code: "NOT_FOUND", requestId: "different" }, { status: 404 });
    },
  }), /código de soporte operacional válido/);
});
