import type { SavedFile } from "./types";
import { readApiResponse } from "@/app/lib/client/http";

type SavedFileUpdate = Pick<SavedFile, "id" | "name" | "status">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSavedFile(value: unknown): value is SavedFile {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.mimeType === "string"
    && typeof value.size === "number"
    && typeof value.origin === "string"
    && (value.status === "activo" || value.status === "archivado")
    && typeof value.createdAt === "string";
}

function hasSavedFiles(value: unknown): value is { files: SavedFile[] } {
  return isRecord(value) && Array.isArray(value.files) && value.files.every(isSavedFile);
}

function hasSavedFile(value: unknown): value is { file: SavedFile } {
  return isRecord(value) && isSavedFile(value.file);
}

function hasSavedFileUpdate(value: unknown): value is { file: SavedFileUpdate } {
  return isRecord(value)
    && isRecord(value.file)
    && typeof value.file.id === "string"
    && typeof value.file.name === "string"
    && (value.file.status === "activo" || value.file.status === "archivado");
}

function hasDeletedIds(value: unknown): value is { deletedIds: string[] } {
  return isRecord(value)
    && Array.isArray(value.deletedIds)
    && value.deletedIds.every((id) => typeof id === "string");
}

export async function listSavedFiles(signal?: AbortSignal): Promise<SavedFile[]> {
  const response = await fetch("/api/files", { cache: "no-store", signal });
  return (await readApiResponse<{ files: SavedFile[] }>(response, { validate: hasSavedFiles })).files;
}

export async function uploadSavedFile(file: File): Promise<SavedFile> {
  const form = new FormData();
  form.set("file", file);
  form.set("origin", "Escritorio");
  const response = await fetch("/api/files", { method: "POST", body: form });
  return (await readApiResponse<{ file: SavedFile }>(response, { validate: hasSavedFile })).file;
}

export async function updateSavedFile(id: string, changes: { name?: string; status?: SavedFile["status"] }): Promise<void> {
  const response = await fetch("/api/files", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...changes }),
  });
  await readApiResponse<{ file: SavedFileUpdate }>(response, { validate: hasSavedFileUpdate });
}

export async function deleteSavedFiles(ids: string[]): Promise<string[]> {
  const response = await fetch("/api/files", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return (await readApiResponse<{ deletedIds: string[] }>(response, { validate: hasDeletedIds })).deletedIds;
}
