export type ApiErrorPayload = {
  error: string;
  code: string;
  requestId?: string;
};

type ApiHandler<Args extends unknown[]> = (
  request: Request,
  ...args: Args
) => Response | Promise<Response>;

type ApiTrace = {
  requestId: string;
  route: string;
  method: string;
  startedAt: number;
};

const requestTraces = new WeakMap<Request, ApiTrace>();
const ERROR_CODE_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

function defaultErrorCode(status: number): string {
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 408) return "REQUEST_TIMEOUT";
  if (status === 409) return "CONFLICT";
  if (status === 410) return "GONE";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 429) return "RATE_LIMITED";
  if (status === 502) return "UPSTREAM_ERROR";
  if (status === 503) return "SERVICE_UNAVAILABLE";
  if (status >= 500) return "INTERNAL_ERROR";
  return "VALIDATION_ERROR";
}

function safeErrorCode(value: unknown, status: number): string {
  return typeof value === "string" && ERROR_CODE_PATTERN.test(value)
    ? value
    : defaultErrorCode(status);
}

export function jsonError(message: string, status = 400, code = defaultErrorCode(status)): Response {
  return Response.json({ error: message, code: safeErrorCode(code, status) }, { status });
}

export function apiTrace(request: Request): Readonly<ApiTrace> | null {
  return requestTraces.get(request) ?? null;
}

export function reportApiFailure(input: {
  requestId: string;
  route: string;
  method: string;
  startedAt: number;
  status: number;
  code: string;
}): void {
  const event = JSON.stringify({
    level: input.status >= 500 ? "error" : "warn",
    event: "api_request_failed",
    requestId: input.requestId,
    route: input.route,
    method: input.method,
    status: input.status,
    code: safeErrorCode(input.code, input.status),
    durationMs: Math.max(0, Date.now() - input.startedAt),
  });
  if (input.status >= 500) console.error(event);
  else console.warn(event);
}

async function tracedResponse(response: Response, trace: ApiTrace): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", trace.requestId);
  if (response.status < 400) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  if (!headers.get("content-type")?.includes("application/json")) {
    reportApiFailure({ ...trace, status: response.status, code: defaultErrorCode(response.status) });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const payload = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
  const code = safeErrorCode(payload?.code, response.status);
  reportApiFailure({ ...trace, status: response.status, code });
  if (!payload || typeof payload.error !== "string") {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  headers.set("content-type", "application/json; charset=utf-8");
  headers.delete("content-length");
  return new Response(JSON.stringify({ ...payload, code, requestId: trace.requestId }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function observeApi<Args extends unknown[]>(route: string, handler: ApiHandler<Args>): ApiHandler<Args> {
  return async (request, ...args) => {
    const trace: ApiTrace = {
      requestId: crypto.randomUUID(),
      route,
      method: request.method,
      startedAt: Date.now(),
    };
    requestTraces.set(request, trace);
    try {
      return await tracedResponse(await handler(request, ...args), trace);
    } catch {
      reportApiFailure({ ...trace, status: 500, code: "INTERNAL_ERROR" });
      return Response.json(
        {
          error: "No se pudo completar la operación.",
          code: "INTERNAL_ERROR",
          requestId: trace.requestId,
        } satisfies ApiErrorPayload,
        { status: 500, headers: { "x-request-id": trace.requestId } },
      );
    }
  };
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
