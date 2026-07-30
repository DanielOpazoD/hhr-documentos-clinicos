export const SIGNATURE_Y_MIN_PERCENT = 33;
export const SIGNATURE_Y_MAX_PERCENT = 67;
export const SIGNATURE_Y_DEFAULT_PERCENT = 40;

export const SIGNING_IMAGE_WIDTH_MIN_PERCENT = 12;
export const SIGNING_IMAGE_WIDTH_MAX_PERCENT = 72;
export const SIGNING_IMAGE_WIDTH_STEP_PERCENT = 6;

export const DOCUMENT_FONT_SIZE_MIN = 11;
export const DOCUMENT_FONT_SIZE_MAX = 16;
export const DOCUMENT_FONT_SIZE_DEFAULT = 16;

export const SIGNOFF_FONT_SIZE_MIN = 10;
export const SIGNOFF_FONT_SIZE_MAX = 16;
export const SIGNOFF_FONT_SIZE_DEFAULT = 13;

export function signoffFontSizeFromDocumentFontSize(value: number) {
  if (!Number.isFinite(value)) return SIGNOFF_FONT_SIZE_DEFAULT;
  return Math.min(SIGNOFF_FONT_SIZE_MAX, Math.max(SIGNOFF_FONT_SIZE_MIN, value - 3));
}

export function clampSignatureY(value: number) {
  return Math.min(SIGNATURE_Y_MAX_PERCENT, Math.max(SIGNATURE_Y_MIN_PERCENT, value));
}

export function clampSigningImageWidth(value: number) {
  if (!Number.isFinite(value)) return defaultImagePlacement("signature").width;
  return Math.min(SIGNING_IMAGE_WIDTH_MAX_PERCENT, Math.max(SIGNING_IMAGE_WIDTH_MIN_PERCENT, value));
}

export function defaultImagePlacement(kind: "signature" | "stamp") {
  return kind === "stamp"
    ? { x: 65, y: 50, width: 28 }
    : { x: 38, y: SIGNATURE_Y_DEFAULT_PERCENT, width: 34 };
}

export function normalizeStoredSignatureY(kind: unknown, y: number) {
  // Legacy documents persisted y=68, but neither preview nor PDF rendered it.
  // Give those records the visual position that replaces the former fixed top offset.
  return kind === "signature" ? clampSignatureY(y) : defaultImagePlacement("signature").y;
}
