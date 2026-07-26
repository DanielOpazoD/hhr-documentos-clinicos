export const SIGNATURE_Y_MIN_PERCENT = 52;
export const SIGNATURE_Y_MAX_PERCENT = 70;
export const SIGNATURE_Y_DEFAULT_PERCENT = 68;

export function clampSignatureY(value: number) {
  return Math.min(SIGNATURE_Y_MAX_PERCENT, Math.max(SIGNATURE_Y_MIN_PERCENT, value));
}
