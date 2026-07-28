import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStoredSignatureY } from "../../app/lib/document-layout.ts";

test("translates the previously ignored legacy signature y coordinate", () => {
  assert.equal(normalizeStoredSignatureY(undefined, 68), 34);
});

test("preserves and clamps vertical positions saved by the two-dimensional editor", () => {
  assert.equal(normalizeStoredSignatureY("signature", 52), 52);
  assert.equal(normalizeStoredSignatureY("signature", 99), 68);
});
