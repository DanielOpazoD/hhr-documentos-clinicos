/**
 * Structural subset of the Cloudflare bindings used by this application.
 * Sites injects the concrete D1/R2 bindings at runtime; keeping the boundary
 * small makes type-checking independent from a generated deployment config.
 */
interface D1Result<T = Record<string, unknown>> {
  results: T[] | null;
  success: boolean;
  meta: Record<string, unknown>;
  error?: string;
}

type D1RowsResult<T = Record<string, unknown>> = Omit<D1Result<T>, "results"> & {
  results: T[];
};

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1RowsResult<T>>;
  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
  dump(): Promise<ArrayBuffer>;
}

interface R2ObjectBody {
  readonly body: ReadableStream<Uint8Array>;
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | Blob | string | null,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    FILES?: R2Bucket;
    [key: string]: unknown;
  };
}

declare const __HHR_RELEASE_COMMIT__: string;
declare const __HHR_RELEASE_MANIFEST_VERSION__: number;
declare const __HHR_RELEASE_SCHEMA__: string;
