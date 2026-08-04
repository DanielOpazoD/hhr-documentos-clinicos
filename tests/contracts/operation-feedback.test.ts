import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError } from "../../app/lib/client/http.ts";
import {
  operationFailure,
  toOperationFailure,
} from "../../app/lib/client/operation-feedback.ts";

test("keeps support references out of the human-facing message", () => {
  const supportId = crypto.randomUUID();
  const failure = toOperationFailure(new ApiClientError({
    message: "No se pudo guardar el documento.",
    status: 503,
    code: "SERVICE_UNAVAILABLE",
    requestId: supportId,
  }), "No se pudo guardar.");

  assert.equal(failure.message, "No se pudo guardar el documento.");
  assert.doesNotMatch(failure.message, new RegExp(supportId));
  assert.equal(failure.supportId, supportId);
  assert.equal(failure.retryable, true);
});

test("classifies transient and validation failures without reading localized copy", () => {
  const throttled = toOperationFailure(new ApiClientError({
    message: "Intente nuevamente.",
    status: 429,
  }), "No se pudo completar.");
  const conflict = toOperationFailure(new ApiClientError({
    message: "El documento cambió.",
    status: 409,
    code: "CONFLICT",
  }), "No se pudo completar.");
  const validation = operationFailure("Revise el nombre del paciente.");

  assert.equal(throttled.retryable, true);
  assert.equal(conflict.retryable, false);
  assert.equal(validation.retryable, false);
});

test("retries only known transient HTTP failures", () => {
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(toOperationFailure(new ApiClientError({ message: "Temporal", status }), "Error").retryable, true);
  }
  for (const status of [400, 401, 403, 409, 422, 501, 505]) {
    assert.equal(toOperationFailure(new ApiClientError({ message: "Permanente", status }), "Error").retryable, false);
  }
});

test("uses safe contextual copy for browser network failures", () => {
  const failure = toOperationFailure(
    new TypeError("Failed to fetch private upstream URL"),
    "No se pudo conectar con el servicio.",
  );

  assert.equal(failure.message, "No se pudo conectar con el servicio.");
  assert.doesNotMatch(failure.message, /private upstream|Failed to fetch/);
  assert.equal(failure.retryable, true);
});

test("does not expose messages from generic errors", () => {
  const failure = toOperationFailure(
    new Error("/private/path patient=confidential"),
    "No se pudo completar la operación.",
  );

  assert.equal(failure.message, "No se pudo completar la operación.");
  assert.doesNotMatch(failure.message, /private|confidential/);
  assert.equal(failure.retryable, false);
});
