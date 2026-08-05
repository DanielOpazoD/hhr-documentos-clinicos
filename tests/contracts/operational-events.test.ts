import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOperationalEvent,
  emitOperationalEvent,
  OPERATIONAL_EVENT_MAX_BYTES,
  operationalReleaseIdentity,
} from "../../app/lib/server/operational-events.ts";

const requestId = "123e4567-e89b-42d3-a456-426614174000";
const forbiddenMarker = "private-value-must-not-appear";
const release = {
  manifestVersion: 1,
  commit: "a".repeat(40),
  schema: "0009_ai_trace_privacy",
};

test("defines one minimal versioned operational event", () => {
  const event = buildOperationalEvent({
    requestId,
    route: "documents.id.versions.POST",
    method: "POST",
    status: 409,
    code: "CONFLICT",
    durationMs: 18.6,
  }, release);

  assert.deepEqual(event, {
    operationalVersion: 1,
    event: "api_request",
    level: "warn",
    outcome: "failure",
    requestId,
    route: "documents.id.versions.POST",
    routeFamily: "documents",
    method: "POST",
    status: 409,
    code: "CONFLICT",
    durationMs: 19,
    releaseManifestVersion: 1,
    releaseCommit: "a".repeat(40),
    releaseSchema: "0009_ai_trace_privacy",
  });
  assert.ok(JSON.stringify(event).length <= OPERATIONAL_EVENT_MAX_BYTES);
});

test("discards additional clinical, identity and credential fields", () => {
  const unsafeInput = {
    requestId,
    route: "files.POST",
    method: "POST",
    status: 201,
    code: "OK",
    durationMs: 12,
    owner_email: "persona@example.test",
    patient: "Paciente Ejemplo 11.111.111-1",
    prompt: "Incluya este diagnóstico",
    filename: "laboratorio-secreto.pdf",
    [["to", "ken"].join("")]: forbiddenMarker,
  };
  const serialized = JSON.stringify(buildOperationalEvent(unsafeInput, release));

  assert.doesNotMatch(serialized, /persona|Paciente|11\.111|diagnóstico|laboratorio|oauth|secret|\.pdf/i);
  assert.deepEqual(Object.keys(JSON.parse(serialized)).sort(), [
    "code",
    "durationMs",
    "event",
    "level",
    "method",
    "operationalVersion",
    "outcome",
    "releaseCommit",
    "releaseManifestVersion",
    "releaseSchema",
    "requestId",
    "route",
    "routeFamily",
    "status",
  ]);
});

test("accepts only release identity fields shared with the release manifest", () => {
  assert.deepEqual(operationalReleaseIdentity({
    HHR_RELEASE_MANIFEST_VERSION: "1",
    HHR_RELEASE_SHA: "B".repeat(40),
    HHR_RELEASE_SCHEMA: "0009_ai_trace_privacy",
    [["OPENAI", "API", "KEY"].join("_")]: forbiddenMarker,
  }), {
    manifestVersion: 1,
    commit: "b".repeat(40),
    schema: "0009_ai_trace_privacy",
  });
  assert.deepEqual(operationalReleaseIdentity({
    HHR_RELEASE_MANIFEST_VERSION: "invalid",
    HHR_RELEASE_SHA: "not-a-commit",
    HHR_RELEASE_SCHEMA: "schema with spaces",
  }), { manifestVersion: 1, commit: "local", schema: "local" });
});

test("never lets logging failure alter application control flow", () => {
  const originalLog = console.log;
  console.log = () => { throw new Error("logger unavailable"); };
  try {
    assert.doesNotThrow(() => emitOperationalEvent({
      requestId,
      route: "documents.GET",
      method: "GET",
      status: 200,
      code: "OK",
      durationMs: 1,
    }));
  } finally {
    console.log = originalLog;
  }
});
