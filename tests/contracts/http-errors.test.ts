import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError, isApiConflict, readApiResponse } from "../../app/lib/client/http.ts";
import { jsonError, observeApi } from "../../app/lib/server/http.ts";
import { progressStream } from "../../app/features/ai/server/progress-stream.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("observeApi correlates handled failures without logging their message", async (context) => {
  const logs: string[] = [];
  context.mock.method(console, "warn", (line: unknown) => logs.push(String(line)));
  const GET = observeApi("contracts.GET", async () => jsonError("Paciente Ejemplo 11.111.111-1", 400));

  const response = await GET(new Request("https://hhr.test/api/contracts"));
  const body = await response.json() as { error: string; code: string; requestId: string };

  assert.equal(response.status, 400);
  assert.equal(body.error, "Paciente Ejemplo 11.111.111-1");
  assert.equal(body.code, "VALIDATION_ERROR");
  assert.match(body.requestId, UUID_PATTERN);
  assert.equal(response.headers.get("x-request-id"), body.requestId);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /Paciente|11\.111/);
  assert.deepEqual(Object.keys(JSON.parse(logs[0])).sort(), [
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
  const event = JSON.parse(logs[0]) as Record<string, unknown>;
  assert.equal(event.event, "api_request");
  assert.equal(event.outcome, "failure");
  assert.equal(event.routeFamily, "contracts");
  assert.equal(event.releaseCommit, "local");
  assert.equal(event.releaseSchema, "local");
});

test("observeApi emits one bounded success without reading its response body", async (context) => {
  const logs: string[] = [];
  context.mock.method(console, "log", (line: unknown) => logs.push(String(line)));
  const GET = observeApi("contracts.GET", async () => Response.json({
    patient: "Paciente Ejemplo",
    prompt: "contenido privado",
  }));

  const response = await GET(new Request("https://hhr.test/api/contracts?email=private@example.test"));

  assert.equal(response.status, 200);
  assert.equal(logs.length, 1);
  const event = JSON.parse(logs[0]) as Record<string, unknown>;
  assert.equal(event.outcome, "success");
  assert.equal(event.code, "OK");
  assert.equal(event.status, 200);
  assert.doesNotMatch(logs[0], /Paciente|prompt|private@example|api\/contracts/i);
});

test("observeApi replaces unexpected failures with a private generic response", async (context) => {
  const logs: string[] = [];
  context.mock.method(console, "error", (line: unknown) => logs.push(String(line)));
  const POST = observeApi("contracts.POST", async () => {
    throw new Error("prompt y RUT que nunca deben llegar al log");
  });

  const response = await POST(new Request("https://hhr.test/api/contracts", { method: "POST" }));
  const body = await response.json() as { error: string; code: string; requestId: string };

  assert.equal(response.status, 500);
  assert.equal(body.error, "No se pudo completar la operación.");
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.match(body.requestId, UUID_PATTERN);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /prompt|RUT/);
});

test("observeApi also correlates non-JSON failures", async (context) => {
  const logs: string[] = [];
  context.mock.method(console, "error", (line: unknown) => logs.push(String(line)));
  const GET = observeApi("contracts.binary.GET", async () => new Response(null, { status: 503 }));

  const response = await GET(new Request("https://hhr.test/api/contracts/binary"));

  assert.equal(response.status, 503);
  assert.match(response.headers.get("x-request-id") ?? "", UUID_PATTERN);
  assert.equal(JSON.parse(logs[0]).code, "SERVICE_UNAVAILABLE");
});

test("readApiResponse preserves status, code and support reference", async () => {
  const requestId = crypto.randomUUID();
  const response = Response.json({
    error: "El documento cambió en otra pestaña.",
    code: "CONFLICT",
    requestId,
  }, { status: 409, headers: { "x-request-id": requestId } });

  await assert.rejects(
    () => readApiResponse(response),
    (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.status, 409);
      assert.equal(error.code, "CONFLICT");
      assert.equal(error.requestId, requestId);
      assert.match(error.message, new RegExp(requestId));
      return true;
    },
  );
});

test("classifies API conflicts without depending on their localized message", () => {
  const localizedConflict = new ApiClientError({
    message: "La revisión remota ya cambió.",
    status: 409,
    code: "CONFLICT",
  });
  const retryableFailure = new ApiClientError({
    message: "Este documento cambió en otra pestaña.",
    status: 503,
    code: "SERVICE_UNAVAILABLE",
  });

  assert.equal(isApiConflict(localizedConflict), true);
  assert.equal(isApiConflict(retryableFailure), false);
  assert.equal(isApiConflict(new Error("CONFLICT")), false);
});

test("readApiResponse rejects malformed successful responses", async () => {
  const requestId = crypto.randomUUID();
  const response = new Response("<html>unexpected upstream page</html>", {
    status: 200,
    headers: { "content-type": "text/html", "x-request-id": requestId },
  });

  await assert.rejects(
    () => readApiResponse(response, { fallbackMessage: "No se pudo cargar la actividad." }),
    (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.status, 200);
      assert.equal(error.code, "INVALID_RESPONSE");
      assert.equal(error.requestId, requestId);
      assert.match(error.message, /No se pudo cargar la actividad/);
      return true;
    },
  );
});

test("readApiResponse rejects array responses and invalid endpoint envelopes", async () => {
  await assert.rejects(
    () => readApiResponse(new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    })),
    (error: unknown) => error instanceof ApiClientError && error.code === "INVALID_RESPONSE",
  );

  await assert.rejects(
    () => readApiResponse<{ files: unknown[] }>(Response.json({}), {
      validate: (value): value is { files: unknown[] } => {
        return value !== null
          && typeof value === "object"
          && "files" in value
          && Array.isArray(value.files);
      },
    }),
    (error: unknown) => error instanceof ApiClientError && error.code === "INVALID_RESPONSE",
  );
});

test("readApiResponse preserves cancellation while reading the body", async () => {
  const response = Response.json({ ok: true });
  const abortError = new DOMException("cancelled", "AbortError");
  Object.defineProperty(response, "json", { value: async () => { throw abortError; } });

  await assert.rejects(() => readApiResponse(response), (error: unknown) => error === abortError);
});

test("progressStream correlates failures that occur after streaming starts", async () => {
  const requestId = crypto.randomUUID();
  let failures = 0;
  const response = progressStream(async () => {
    throw new Error("El proveedor no respondió.");
  }, {
    code: "AI_GENERATION_FAILED",
    requestId,
    onError: () => { failures += 1; },
  });

  const event = JSON.parse((await response.text()).trim()) as Record<string, unknown>;
  assert.equal(failures, 1);
  assert.equal(event.type, "error");
  assert.equal(event.code, "AI_GENERATION_FAILED");
  assert.equal(event.requestId, requestId);
  assert.equal(event.error, "No se pudo completar la operación.");
});

test("progressStream reports exactly one terminal success", async () => {
  let completions = 0;
  let failures = 0;
  let cancellations = 0;
  const response = progressStream(async (emit) => {
    emit({ type: "result", ok: true });
  }, {
    onComplete: () => { completions += 1; },
    onError: () => { failures += 1; },
    onCancel: () => { cancellations += 1; },
  });

  assert.match(await response.text(), /"ok":true/);
  assert.deepEqual({ completions, failures, cancellations }, {
    completions: 1,
    failures: 0,
    cancellations: 0,
  });
});

test("progressStream exposes only the route-selected safe timeout message", async () => {
  let code = "AI_GENERATION_FAILED";
  let message = "No se pudo completar la operación.";
  const response = progressStream(async () => {
    code = "AI_PROVIDER_TIMEOUT";
    message = "La operación de IA tardó demasiado.";
    throw new Error("upstream host and private prompt detail");
  }, {
    code: () => code,
    errorMessage: () => message,
  });

  const event = JSON.parse((await response.text()).trim()) as Record<string, unknown>;
  assert.equal(event.code, "AI_PROVIDER_TIMEOUT");
  assert.equal(event.error, "La operación de IA tardó demasiado.");
  assert.doesNotMatch(JSON.stringify(event), /upstream host|private prompt/);
});

test("progressStream aborts disconnected work without reporting an operational failure", async () => {
  let observedAbort = false;
  let failures = 0;
  let cancellations = 0;
  let notifyStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
  const response = progressStream(async (_emit, signal) => {
    notifyStarted?.();
    await new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => {
        observedAbort = true;
        resolve();
      }, { once: true });
    });
  }, {
    onError: () => { failures += 1; },
    onCancel: () => { cancellations += 1; },
  });
  const reader = response.body!.getReader();

  await started;
  await reader.cancel();

  assert.equal(observedAbort, true);
  assert.equal(failures, 0);
  assert.equal(cancellations, 1);
});

test("progressStream forwards request cancellation to its producer", async () => {
  const requestController = new AbortController();
  let observedAbort = false;
  let cancellations = 0;
  let notifyStarted: (() => void) | undefined;
  let finishProduce: (() => void) | undefined;
  const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
  const pendingProduce = new Promise<void>((resolve) => { finishProduce = resolve; });
  const response = progressStream(async (_emit, signal) => {
    notifyStarted?.();
    signal.addEventListener("abort", () => { observedAbort = true; }, { once: true });
    await pendingProduce;
  }, {
    signal: requestController.signal,
    onCancel: () => { cancellations += 1; },
  });

  await started;
  requestController.abort();
  assert.equal(observedAbort, true);
  assert.equal(cancellations, 1);

  finishProduce?.();
  assert.equal(await response.text(), "");
  assert.equal(cancellations, 1);
});
