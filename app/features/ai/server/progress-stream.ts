type StreamEvent = Record<string, unknown>;

export function progressStream(
  produce: (emit: (event: StreamEvent) => void) => Promise<void>,
  options: {
    code?: string;
    requestId?: string;
    onError?: () => void;
  } = {},
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: StreamEvent) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        await produce(emit);
      } catch (error) {
        options.onError?.();
        emit({
          type: "error",
          error: error instanceof Error ? error.message : "No se pudo generar el borrador.",
          code: options.code,
          requestId: options.requestId,
        });
      } finally {
        open = false;
        controller.close();
      }
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
