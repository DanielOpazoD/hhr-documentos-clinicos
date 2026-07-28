export const SIGNATURE_Y_MIN_PERCENT = 12;
export const SIGNATURE_Y_MAX_PERCENT = 68;
export const SIGNATURE_Y_DEFAULT_PERCENT = 38;

export const DOCUMENT_FONT_SIZE_MIN = 11;
export const DOCUMENT_FONT_SIZE_MAX = 16;
export const DOCUMENT_FONT_SIZE_DEFAULT = 13;

export function clampSignatureY(value: number) {
  return Math.min(SIGNATURE_Y_MAX_PERCENT, Math.max(SIGNATURE_Y_MIN_PERCENT, value));
}

export function defaultImagePlacement(kind: "signature" | "stamp") {
  return kind === "stamp"
    ? { x: 65, y: 42, width: 24 }
    : { x: 38, y: 34, width: 30 };
}

export function normalizeStoredSignatureY(kind: unknown, y: number) {
  // Legacy documents persisted y=68, but neither preview nor PDF rendered it.
  // Give those records the visual position that replaces the former fixed top offset.
  return kind === "signature" ? clampSignatureY(y) : defaultImagePlacement("signature").y;
}
