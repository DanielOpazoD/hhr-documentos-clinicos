import assert from "node:assert/strict";
import test from "node:test";
import { jpegExifOrientation } from "../../app/lib/image-orientation.ts";

function exifJpeg(orientation: number) {
  const payload = new Uint8Array([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
    orientation, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const length = payload.length + 2;
  return new File([
    new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff]),
    payload,
    new Uint8Array([0xff, 0xd9]),
  ], "oriented.jpg", { type: "image/jpeg" });
}

test("reads EXIF orientation before deciding whether JPEG bytes are safe to preserve", async () => {
  assert.equal(await jpegExifOrientation(exifJpeg(6)), 6);
  assert.equal(await jpegExifOrientation(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "plain.jpg", { type: "image/jpeg" })), 1);
  assert.equal(await jpegExifOrientation(new File([new Uint8Array([0, 1, 2, 3])], "invalid.jpg", { type: "image/jpeg" })), null);
});
