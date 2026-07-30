export type GoogleDriveConfig = {
  configured: boolean;
  clientId?: string;
  apiKey?: string;
  appId?: string;
  scope: string;
};

type DriveDocument = { id: string; name: string; mimeType: string };
type GoogleTokenResponse = { access_token?: string; expires_in?: number; error?: string };
type GooglePickerData = Record<string, unknown>;

type GoogleRuntime = {
  accounts: { oauth2: { initTokenClient(config: {
    client_id: string;
    scope: string;
    callback(response: GoogleTokenResponse): void;
    error_callback?(error: { type?: string }): void;
  }): { requestAccessToken(options?: { prompt?: string }): void } } };
  picker: {
    Action: { PICKED: string; CANCEL: string };
    Document: { ID: string; NAME: string; MIME_TYPE: string };
    Feature: { MULTISELECT_ENABLED: string };
    Response: { ACTION: string; DOCUMENTS: string };
    ViewId: { DOCS: string };
    DocsView: new (viewId: string) => {
      setIncludeFolders(value: boolean): unknown;
      setSelectFolderEnabled(value: boolean): unknown;
      setMimeTypes(value: string): unknown;
    };
    PickerBuilder: new () => {
      addView(view: unknown): unknown;
      enableFeature(feature: string): unknown;
      setAppId(appId: string): unknown;
      setCallback(callback: (data: GooglePickerData) => void): unknown;
      setDeveloperKey(apiKey: string): unknown;
      setOAuthToken(token: string): unknown;
      setOrigin(origin: string): unknown;
      build(): { setVisible(value: boolean): void };
    };
  };
};

type GapiRuntime = { load(name: string, options: { callback(): void; onerror(): void }): void };

const IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const API_SCRIPT = "https://apis.google.com/js/api.js";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PICKER_MIME_TYPES = ["application/pdf", DOCX_MIME, "image/jpeg", "image/png", GOOGLE_DOC_MIME].join(",");
let tokenCache: { value: string; expiresAt: number } | null = null;
const scriptPromises = new Map<string, Promise<void>>();

function browserGlobals(): { google?: GoogleRuntime; gapi?: GapiRuntime } {
  return window as unknown as { google?: GoogleRuntime; gapi?: GapiRuntime };
}

function loadScript(src: string): Promise<void> {
  const cached = scriptPromises.get(src);
  if (cached) return cached;
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded === "true") return resolve();
    const script = existing ?? document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => { script.dataset.loaded = "true"; resolve(); }, { once: true });
    script.addEventListener("error", () => reject(new Error("No se pudo cargar el acceso seguro de Google Drive.")), { once: true });
    if (!existing) document.head.appendChild(script);
  });
  scriptPromises.set(src, promise);
  return promise;
}

export async function fetchGoogleDriveConfig(): Promise<GoogleDriveConfig> {
  const response = await fetch("/api/integrations/google-drive/config", { cache: "no-store" });
  const data = await response.json().catch(() => ({ configured: false, scope: "" })) as GoogleDriveConfig & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "No se pudo consultar Google Drive.");
  return data;
}

async function accessToken(config: GoogleDriveConfig): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  if (!config.clientId) throw new Error("Google Drive no está configurado.");
  await loadScript(IDENTITY_SCRIPT);
  const google = browserGlobals().google;
  if (!google?.accounts?.oauth2) throw new Error("Google no inició el acceso a Drive.");
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: config.clientId!,
      scope: config.scope,
      callback(response) {
        if (!response.access_token || response.error) {
          reject(new Error("No se autorizó el acceso a Google Drive."));
          return;
        }
        tokenCache = {
          value: response.access_token,
          expiresAt: Date.now() + Math.max(60, Number(response.expires_in ?? 3_600)) * 1_000,
        };
        resolve(response.access_token);
      },
      error_callback() { reject(new Error("Se cerró o bloqueó el acceso a Google Drive.")); },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

async function loadPicker(): Promise<GoogleRuntime> {
  await loadScript(API_SCRIPT);
  const gapi = browserGlobals().gapi;
  if (!gapi) throw new Error("Google Drive no cargó el selector de archivos.");
  await new Promise<void>((resolve, reject) => gapi.load("picker", { callback: resolve, onerror: () => reject(new Error("Google Drive no cargó el selector de archivos.")) }));
  const google = browserGlobals().google;
  if (!google?.picker) throw new Error("Google Drive no cargó el selector de archivos.");
  return google;
}

async function pickDocuments(config: GoogleDriveConfig, token: string): Promise<DriveDocument[]> {
  const google = await loadPicker();
  return new Promise<DriveDocument[]>((resolve, reject) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(false);
    view.setMimeTypes(PICKER_MIME_TYPES);
    const builder = new google.picker.PickerBuilder();
    builder.addView(view);
    builder.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
    builder.setAppId(config.appId!);
    builder.setDeveloperKey(config.apiKey!);
    builder.setOAuthToken(token);
    builder.setOrigin(window.location.origin);
    builder.setCallback((data) => {
      const action = data[google.picker.Response.ACTION];
      if (action === google.picker.Action.CANCEL) return resolve([]);
      if (action !== google.picker.Action.PICKED) return;
      const documents = data[google.picker.Response.DOCUMENTS];
      if (!Array.isArray(documents)) return reject(new Error("Google Drive no devolvió archivos válidos."));
      resolve(documents.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const document = item as Record<string, unknown>;
        const id = String(document[google.picker.Document.ID] ?? document.id ?? "");
        const name = String(document[google.picker.Document.NAME] ?? document.name ?? "");
        const mimeType = String(document[google.picker.Document.MIME_TYPE] ?? document.mimeType ?? "");
        return id && name && mimeType ? [{ id, name, mimeType }] : [];
      }));
    });
    builder.build().setVisible(true);
  });
}

async function downloadDocument(document: DriveDocument, token: string): Promise<File> {
  const isGoogleDoc = document.mimeType === GOOGLE_DOC_MIME;
  const endpoint = isGoogleDoc
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(document.id)}/export?mimeType=${encodeURIComponent(DOCX_MIME)}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(document.id)}?alt=media`;
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    if (response.status === 401) tokenCache = null;
    throw new Error(`No se pudo descargar ${document.name} desde Google Drive.`);
  }
  const blob = await response.blob();
  const name = isGoogleDoc && !document.name.toLowerCase().endsWith(".docx") ? `${document.name}.docx` : document.name;
  return new File([blob], name, { type: isGoogleDoc ? DOCX_MIME : document.mimeType, lastModified: Date.now() });
}

export async function selectGoogleDriveFiles(config: GoogleDriveConfig, availableSlots: number): Promise<File[]> {
  if (!config.configured || !config.apiKey || !config.appId) throw new Error("Google Drive no está configurado.");
  if (availableSlots < 1) throw new Error("Quite un archivo antes de seleccionar desde Drive.");
  const token = await accessToken(config);
  const documents = await pickDocuments(config, token);
  if (documents.length > availableSlots) throw new Error(`Puede agregar ${availableSlots} archivo${availableSlots === 1 ? "" : "s"} más.`);
  return Promise.all(documents.map((document) => downloadDocument(document, token)));
}
