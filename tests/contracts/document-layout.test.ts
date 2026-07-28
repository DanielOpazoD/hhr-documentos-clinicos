import assert from "node:assert/strict";
import test from "node:test";
import {
  clampSigningImageWidth,
  defaultImagePlacement,
  normalizeStoredSignatureY,
} from "../../app/lib/document-layout.ts";

test("translates the previously ignored legacy signature y coordinate", () => {
  assert.equal(normalizeStoredSignatureY(undefined, 68), 40);
});

test("preserves and clamps vertical positions saved by the two-dimensional editor", () => {
  assert.equal(normalizeStoredSignatureY("signature", 1), 33);
  assert.equal(normalizeStoredSignatureY("signature", 52), 52);
  assert.equal(normalizeStoredSignatureY("signature", 99), 67);
});

test("keeps signing image widths within a useful, safe range", () => {
  assert.equal(clampSigningImageWidth(Number.NaN), 34);
  assert.equal(clampSigningImageWidth(5), 12);
  assert.equal(clampSigningImageWidth(48), 48);
  assert.equal(clampSigningImageWidth(90), 72);
});

test("starts new signature assets at a legible size", () => {
  assert.equal(defaultImagePlacement("signature").width, 34);
  assert.equal(defaultImagePlacement("stamp").width, 28);
});
