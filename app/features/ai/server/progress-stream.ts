type StreamEvent = Record<string, unknown>;

export function progressStream(
  produce: (emit: (event: StreamEvent) => void, signal: AbortSignal) => Promise<void>,
  options: {
    code?: string | (() => string);
    errorMessage?: string | (() => string);
    requestId?: string;
    signal?: AbortSignal;
    onError?: () => void;
  } = {},
): Response {
  const encoder = new TextEncoder();
  const lifetime = new AbortController();
  let open = true;
  const forwardAbort = () => lifetime.abort();
  if (options.signal?.aborted) forwardAbort();
  else options.signal?.addEventListener("abort", forwardAbort, { once: true });
  const detachSignal = () => options.signal?.removeEventListener("abort", forwardAbort);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        if (!open || lifetime.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
          lifetime.abort();
        }
      };
      try {
        await produce(emit, lifetime.signal);
      } catch {
        if (!lifetime.signal.aborted) {
          options.onError?.();
          emit({
            type: "error",
            error: typeof options.errorMessage === "function"
              ? options.errorMessage()
              : options.errorMessage ?? "No se pudo completar la operación.",
            code: typeof options.code === "function" ? options.code() : options.code,
            requestId: options.requestId,
          });
        }
      } finally {
        detachSignal();
        if (open) {
          open = false;
          controller.close();
        }
      }
    },
    cancel() {
      open = false;
      lifetime.abort();
      detachSignal();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
