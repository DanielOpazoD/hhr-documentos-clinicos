export type MobileSessionState = {
  status: string;
  expiresAt: string;
};

export type DerivedMobileSessionStatus = "activa" | "expirada" | "revocada";
export const MOBILE_SESSION_TTL_MS = 10 * 60 * 1000;
export const MOBILE_CAPTURE_STALE_MS = MOBILE_SESSION_TTL_MS + 5 * 60 * 1000;
export const MOBILE_CAPTURE_MAX_FILES = 8;

export function deriveMobileSessionStatus(
  session: MobileSessionState,
  now = Date.now(),
): DerivedMobileSessionStatus {
  if (session.status === "expirada") return "expirada";
  if (session.status !== "activa") return "revocada";
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now ? "activa" : "expirada";
}

export function isActiveMobileSession(
  session: MobileSessionState | null,
  now = Date.now(),
): session is MobileSessionState {
  return Boolean(session && deriveMobileSessionStatus(session, now) === "activa");
}
