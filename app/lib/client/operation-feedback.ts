import { ApiClientError } from "./http.ts";

export type OperationFailure = {
  message: string;
  supportId?: string;
  retryable: boolean;
};

type FailureOptions = {
  retryable?: boolean;
};

function retryableStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

export function operationFailure(message: string, options: FailureOptions = {}): OperationFailure {
  return {
    message,
    retryable: options.retryable ?? false,
  };
}

export function toOperationFailure(
  cause: unknown,
  fallbackMessage: string,
  options: FailureOptions = {},
): OperationFailure {
  if (cause instanceof ApiClientError) {
    return {
      message: cause.userMessage,
      supportId: cause.requestId,
      retryable: options.retryable ?? retryableStatus(cause.status),
    };
  }

  if (cause instanceof TypeError) {
    return operationFailure(fallbackMessage, { retryable: options.retryable ?? true });
  }

  return operationFailure(fallbackMessage, options);
}
