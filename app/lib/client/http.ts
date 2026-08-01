export type ApiErrorDetails = {
  message: string;
  status: number;
  code?: string;
  requestId?: string;
};

type ApiResponseOptions<T> = {
  fallbackMessage?: string;
  createError?: (details: ApiErrorDetails) => Error;
  validate?: (value: unknown) => value is T;
};

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9-]{8,80}$/;
const ERROR_CODE_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

function optionalValue(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

function supportMessage(message: string, requestId?: string): string {
  return requestId ? `${message} Código de soporte: ${requestId}.` : message;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly userMessage: string;

  constructor(details: ApiErrorDetails) {
    super(supportMessage(details.message, details.requestId));
    this.name = "ApiClientError";
    this.status = details.status;
    this.code = details.code;
    this.requestId = details.requestId;
    this.userMessage = details.message;
  }
}

export async function readApiResponse<T>(response: Response, options: ApiResponseOptions<T> = {}): Promise<T> {
  let parsed = false;
  const value = await response.json().then((data: unknown) => {
    parsed = true;
    return data;
  }).catch((cause: unknown) => {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    return null;
  });
  const payload = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

  const requestId = optionalValue(payload?.requestId, REQUEST_ID_PATTERN)
    ?? optionalValue(response.headers.get("x-request-id"), REQUEST_ID_PATTERN);
  if (response.ok) {
    const validObject = parsed && value !== null && typeof value === "object" && !Array.isArray(value);
    if (validObject && (!options.validate || options.validate(value))) return value as T;
    const details: ApiErrorDetails = {
      message: options.fallbackMessage ?? "El servidor devolvió una respuesta inválida.",
      status: response.status,
      code: "INVALID_RESPONSE",
      requestId,
    };
    throw options.createError?.(details) ?? new ApiClientError(details);
  }

  const details: ApiErrorDetails = {
    message: typeof payload?.error === "string"
      ? payload.error
      : response.status === 413
        ? "El archivo es demasiado grande. Use una versión más liviana."
        : options.fallbackMessage ?? "No se pudo completar la operación.",
    status: response.status,
    code: optionalValue(payload?.code, ERROR_CODE_PATTERN),
    requestId,
  };
  throw options.createError?.(details) ?? new ApiClientError(details);
}
