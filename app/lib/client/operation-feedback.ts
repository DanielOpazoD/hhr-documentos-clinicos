import { ApiClientError } from "./http.ts";

export type OperationFailure = {
  message: string;
  supportId?: string;
  code?: string;
  retryable: boolean;
};

type FailureOptions = {
  retryable?: boolean;
};

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
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
      code: cause.code,
      retryable: options.retryable ?? retryableStatus(cause.status),
    };
  }

  if (cause instanceof TypeError) {
    return operationFailure(fallbackMessage, { retryable: options.retryable ?? true });
  }

  if (cause instanceof Error && cause.message.trim()) {
    return operationFailure(cause.message, options);
  }

  return operationFailure(fallbackMessage, options);
}
