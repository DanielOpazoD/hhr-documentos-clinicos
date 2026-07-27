export type MobileSessionState = {
  status: string;
  expiresAt: string;
};

export function isActiveMobileSession(
  session: MobileSessionState | null,
  now = Date.now(),
): session is MobileSessionState {
  if (!session || session.status !== "activa") return false;
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}
