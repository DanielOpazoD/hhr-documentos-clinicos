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

test("uses safe contextual copy for browser network failures", () => {
  const failure = toOperationFailure(
    new TypeError("Failed to fetch private upstream URL"),
    "No se pudo conectar con el servicio.",
  );

  assert.equal(failure.message, "No se pudo conectar con el servicio.");
  assert.doesNotMatch(failure.message, /private upstream|Failed to fetch/);
  assert.equal(failure.retryable, true);
});
