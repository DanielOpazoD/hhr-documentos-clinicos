import type {
  SaveDocumentInput,
  SignatureAssetKind,
  SignatureForm,
  SignatureRecord,
  StoredDocument,
  StoredDocumentDetail,
  StoredDocumentVersion,
} from "./types";
import { readApiResponse } from "@/app/lib/client/http";

export async function listDocuments(signal?: AbortSignal): Promise<StoredDocument[]> {
  const response = await fetch("/api/documents", { signal });
  const data = await readApiResponse<{ documents?: StoredDocument[] }>(response);
  return data.documents ?? [];
}

export async function getDocument(id: string): Promise<StoredDocumentDetail> {
  const response = await fetch(`/api/documents?id=${encodeURIComponent(id)}`);
  const data = await readApiResponse<{ document: StoredDocumentDetail }>(response);
  return data.document;
}

export async function saveDocument(input: SaveDocumentInput) {
  const response = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readApiResponse<{ document: StoredDocument }>(response);
  return data.document;
}

export async function listDocumentVersions(id: string): Promise<StoredDocumentVersion[]> {
  const response = await fetch(`/api/documents/${encodeURIComponent(id)}/versions`);
  const data = await readApiResponse<{ versions?: StoredDocumentVersion[] }>(response);
  return data.versions ?? [];
}

export async function restoreDocumentVersion(id: string, version: number, expectedUpdatedAt: string): Promise<void> {
  const response = await fetch(`/api/documents/${encodeURIComponent(id)}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, expectedUpdatedAt }),
  });
  await readApiResponse<{ ok: true }>(response);
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
  const data = await readApiResponse<{ ok: true; deletedIds: string[] }>(response);
  return data.deletedIds;
}

export async function listSignatures(signal?: AbortSignal): Promise<SignatureRecord[]> {
  const response = await fetch("/api/signatures", { signal });
  const data = await readApiResponse<{ signatures?: SignatureRecord[] }>(response);
  return data.signatures ?? [];
}

export async function createSignature(input: SignatureForm, kind: SignatureAssetKind): Promise<SignatureRecord> {
  if (!input.file) throw new Error(`Seleccione una imagen de ${kind === "stamp" ? "timbre" : "firma"}.`);
  const form = new FormData();
  form.set("file", input.file);
  form.set("kind", kind);
  form.set("professionalName", input.professionalName);
  form.set("professionalRut", input.professionalRut);
  form.set("specialty", input.specialty);
  const response = await fetch("/api/signatures", { method: "POST", body: form });
  const data = await readApiResponse<{ signature: SignatureRecord }>(response);
  return data.signature;
}

export async function setDefaultSignature(id: string): Promise<void> {
  const response = await fetch(`/api/signatures/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isDefault: true }),
  });
  await readApiResponse<{ ok: true }>(response);
}

export async function deleteSignature(id: string): Promise<void> {
  const response = await fetch(`/api/signatures/${encodeURIComponent(id)}`, { method: "DELETE" });
  await readApiResponse<{ ok: true }>(response);
}
