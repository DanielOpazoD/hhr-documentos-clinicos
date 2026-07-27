import type { SavedFile } from "./types";

async function responseData<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "No se pudo completar la operación.");
  return data;
}

export async function listSavedFiles(signal?: AbortSignal): Promise<SavedFile[]> {
  const response = await fetch("/api/files", { cache: "no-store", signal });
  return (await responseData<{ files?: SavedFile[] }>(response)).files ?? [];
}

export async function uploadSavedFile(file: File): Promise<SavedFile> {
  const form = new FormData();
  form.set("file", file);
  form.set("origin", "Escritorio");
  const response = await fetch("/api/files", { method: "POST", body: form });
  return (await responseData<{ file: SavedFile }>(response)).file;
}

export async function updateSavedFile(id: string, changes: { name?: string; status?: SavedFile["status"] }): Promise<void> {
  const response = await fetch("/api/files", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...changes }),
  });
  await responseData<{ file: Pick<SavedFile, "id" | "name" | "status"> }>(response);
}

export async function deleteSavedFiles(ids: string[]): Promise<string[]> {
  const response = await fetch("/api/files", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return (await responseData<{ deletedIds: string[] }>(response)).deletedIds;
}
