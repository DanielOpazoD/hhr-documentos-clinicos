import type { SavedFile } from "./types";
import { readApiResponse } from "@/app/lib/client/http";

export async function listSavedFiles(signal?: AbortSignal): Promise<SavedFile[]> {
  const response = await fetch("/api/files", { cache: "no-store", signal });
  return (await readApiResponse<{ files?: SavedFile[] }>(response)).files ?? [];
}

export async function uploadSavedFile(file: File): Promise<SavedFile> {
  const form = new FormData();
  form.set("file", file);
  form.set("origin", "Escritorio");
  const response = await fetch("/api/files", { method: "POST", body: form });
  return (await readApiResponse<{ file: SavedFile }>(response)).file;
}

export async function updateSavedFile(id: string, changes: { name?: string; status?: SavedFile["status"] }): Promise<void> {
  const response = await fetch("/api/files", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...changes }),
  });
  await readApiResponse<{ file: Pick<SavedFile, "id" | "name" | "status"> }>(response);
}

export async function deleteSavedFiles(ids: string[]): Promise<string[]> {
  const response = await fetch("/api/files", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return (await readApiResponse<{ deletedIds: string[] }>(response)).deletedIds;
}
