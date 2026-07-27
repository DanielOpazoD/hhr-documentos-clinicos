import type {
  SaveDocumentInput,
  SignatureForm,
  SignatureRecord,
  StoredDocument,
  StoredDocumentDetail,
} from "./types";

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "No se pudo completar la operación.");
  }
  return data;
}

export async function listDocuments(signal?: AbortSignal): Promise<StoredDocument[]> {
  const response = await fetch("/api/documents", { signal });
  const data = await parseResponse<{ documents?: StoredDocument[] }>(response);
  return data.documents ?? [];
}

export async function getDocument(id: string): Promise<StoredDocumentDetail> {
  const response = await fetch(`/api/documents?id=${encodeURIComponent(id)}`);
  const data = await parseResponse<{ document: StoredDocumentDetail }>(response);
  return data.document;
}

export async function saveDocument(input: SaveDocumentInput) {
  const response = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseResponse<{ document: StoredDocument }>(response);
  return data.document;
}

export async function removeStoredDocument(id: string): Promise<void> {
  await removeStoredDocuments([id]);
}

export async function removeStoredDocuments(ids: string[]): Promise<string[]> {
  const response = await fetch("/api/documents", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const data = await parseResponse<{ ok: true; deletedIds: string[] }>(response);
  return data.deletedIds;
}

export async function listSignatures(signal?: AbortSignal): Promise<SignatureRecord[]> {
  const response = await fetch("/api/signatures", { signal });
  const data = await parseResponse<{ signatures?: SignatureRecord[] }>(response);
  return data.signatures ?? [];
}

export async function createSignature(input: SignatureForm): Promise<SignatureRecord> {
  if (!input.file) throw new Error("Seleccione una imagen de firma.");
  const form = new FormData();
  form.set("file", input.file);
  form.set("professionalName", input.professionalName);
  form.set("professionalRut", input.professionalRut);
  form.set("specialty", input.specialty);
  const response = await fetch("/api/signatures", { method: "POST", body: form });
  const data = await parseResponse<{ signature: SignatureRecord }>(response);
  return data.signature;
}

export async function setDefaultSignature(id: string): Promise<void> {
  const response = await fetch(`/api/signatures/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isDefault: true }),
  });
  await parseResponse<{ ok: true }>(response);
}

export async function deleteSignature(id: string): Promise<void> {
  const response = await fetch(`/api/signatures/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseResponse<{ ok: true }>(response);
}
