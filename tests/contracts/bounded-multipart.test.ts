import assert from "node:assert/strict";
import test from "node:test";
import {
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "../../app/lib/server/bounded-multipart.ts";

test("rejects an oversized multipart body even without Content-Length", async () => {
  const boundary = "hhr-bounded-body";
  const body = new TextEncoder().encode([
    `--${boundary}`,
    'Content-Disposition: form-data; name="unused"',
    "",
    "x".repeat(2_000),
    `--${boundary}--`,
    "",
  ].join("\r\n"));
  const request = new Request("https://hhr.test/upload", {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
  assert.equal(request.headers.has("content-length"), false);
  await assert.rejects(() => readBoundedFormData(request, 1_000), RequestBodyTooLargeError);
});

test("parses a bounded multipart request after measuring its actual stream", async () => {
  const original = new FormData();
  original.set("payload", "contenido sintético");
  const request = new Request("https://hhr.test/upload", { method: "POST", body: original });
  const parsed = await readBoundedFormData(request, 10_000);
  assert.equal(parsed.get("payload"), "contenido sintético");
});
