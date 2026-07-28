import type { SavedFile } from "./types";

export const MOBILE_CAPTURE_STORAGE_KEY = "hhr:mobile-capture-token";
export const MOBILE_CAPTURE_TOKEN_PATTERN = /^[a-f0-9]{48}$/;

export type MobileSessionStatus = "activa" | "revocada" | "expirada";

export type MobileSession = {
  id: string;
  expiresAt: string;
  status: MobileSessionStatus;
};

export type CreatedMobileSession = MobileSession & {
  token: string;
};

export type CaptureSession = Pick<MobileSession, "id" | "expiresAt"> & {
  status?: MobileSessionStatus;
  remainingFiles: number;
};

export type RevokedMobileSession = Pick<MobileSession, "id" | "status"> & {
  expiresAt?: string;
};

export type CapturedUpload = {
  file: Omit<SavedFile, "status">;
  remainingFiles: number;
};

export class MobileSessionClientError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "MobileSessionClientError";
  }
}

async function responseData<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string; code?: string };
  if (!response.ok) {
    throw new MobileSessionClientError(data.error ?? "No se pudo completar la operación.", response.status, data.code);
  }
  return data;
}

export function isCaptureToken(value: string): boolean {
  return MOBILE_CAPTURE_TOKEN_PATTERN.test(value);
}

export function forgetStoredCaptureToken(): void {
  try {
    window.sessionStorage.removeItem(MOBILE_CAPTURE_STORAGE_KEY);
  } catch {
    // The in-memory flow still works when browser storage is unavailable.
  }
}

export async function createMobileSession(signal?: AbortSignal): Promise<CreatedMobileSession> {
  const response = await fetch("/api/mobile-sessions", { method: "POST", signal });
  return (await responseData<{ session: CreatedMobileSession }>(response)).session;
}

export async function getMobileSession(id: string, signal?: AbortSignal): Promise<{ session: MobileSession; files: SavedFile[] }> {
  const query = new URLSearchParams({ id });
  const response = await fetch(`/api/mobile-sessions?${query}`, { cache: "no-store", signal });
  const data = await responseData<{ session: MobileSession; files?: SavedFile[] }>(response);
  return { session: data.session, files: data.files ?? [] };
}

export async function revokeMobileSession(id: string): Promise<RevokedMobileSession> {
  const response = await fetch("/api/mobile-sessions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return (await responseData<{ ok: true; session: RevokedMobileSession }>(response)).session;
}

export async function getCaptureSession(token: string, signal?: AbortSignal): Promise<CaptureSession> {
  const response = await fetch("/api/mobile-upload", {
    cache: "no-store",
    headers: { "x-hhr-capture-token": token },
    referrerPolicy: "no-referrer",
    signal,
  });
  return (await responseData<{ session: CaptureSession }>(response)).session;
}

export async function uploadCapturedFile(token: string, file: File, fileName: string, uploadId: string): Promise<CapturedUpload> {
  const form = new FormData();
  form.set("file", file, fileName);
  const response = await fetch("/api/mobile-upload", {
    method: "POST",
    body: form,
    headers: {
      "x-hhr-capture-token": token,
      "x-hhr-upload-id": uploadId,
    },
    referrerPolicy: "no-referrer",
  });
  return responseData<CapturedUpload>(response);
}
