"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteSavedFiles, listSavedFiles, updateSavedFile, uploadSavedFile } from "./client";
import type { FileSort, FileStatusFilter, FileView, SavedFile } from "./types";
import { toOperationFailure, type OperationFailure } from "@/app/lib/client/operation-feedback";

type FilesOperation = "load" | "rename" | "delete" | "upload" | "archive";
type FilesFailure = OperationFailure & { operation: FilesOperation };

function filesFailure(cause: unknown, message: string, operation: FilesOperation): FilesFailure {
  return { ...toOperationFailure(cause, message), operation };
}

export function useFilesLibrary() {
  const [files, setFiles] = useState<SavedFile[]>([]);
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState("todos");
  const [statusFilter, setStatusFilter] = useState<FileStatusFilter>("todos");
  const [sort, setSort] = useState<FileSort>("recent");
  const [view, setView] = useState<FileView>("grid");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<FilesFailure | null>(null);
  const [preview, setPreview] = useState<SavedFile | null>(null);
  const [renaming, setRenaming] = useState<SavedFile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      setFiles(await listSavedFiles(signal));
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(filesFailure(cause, "No se pudieron cargar los archivos.", "load"));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [refresh]);

  const origins = useMemo(() => [...new Set(files.map((file) => file.origin))].sort((a, b) => a.localeCompare(b, "es-CL")), [files]);
  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es-CL");
    return files
      .filter((file) => (!normalizedQuery || file.name.toLocaleLowerCase("es-CL").includes(normalizedQuery))
        && (origin === "todos" || file.origin === origin)
        && (statusFilter === "todos" || file.status === statusFilter))
      .sort((left, right) => {
        if (sort === "name") return left.name.localeCompare(right.name, "es-CL", { numeric: true });
        if (sort === "size") return right.size - left.size;
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      });
  }, [files, origin, query, sort, statusFilter]);

  const allVisibleSelected = filteredFiles.length > 0 && filteredFiles.every((file) => selectedIds.has(file.id));
  const pendingDeleteFiles = pendingDeleteIds.map((id) => files.find((file) => file.id === id)).filter((file): file is SavedFile => Boolean(file));

  const closeTransient = useCallback(() => {
    if (pendingDeleteIds.length) setPendingDeleteIds([]);
    else if (renaming) setRenaming(null);
    else if (preview) setPreview(null);
    else if (selectionMode) { setSelectionMode(false); setSelectedIds(new Set()); }
  }, [pendingDeleteIds.length, preview, renaming, selectionMode]);

  const saveRename = useCallback(async () => {
    if (!renaming || !renameValue.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateSavedFile(renaming.id, { name: renameValue.trim() });
      setFiles((current) => current.map((file) => file.id === renaming.id ? { ...file, name: renameValue.trim() } : file));
      setRenaming(null);
      setMessage("Nombre actualizado.");
    } catch (cause) {
      setError(filesFailure(cause, "No se pudo cambiar el nombre.", "rename"));
    } finally {
      setBusy(false);
    }
  }, [busy, renameValue, renaming]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteIds.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const deletedIds = await deleteSavedFiles(pendingDeleteIds);
      const deleted = new Set(deletedIds);
      setFiles((current) => current.filter((file) => !deleted.has(file.id)));
      setSelectedIds(new Set());
      setSelectionMode(false);
      setPendingDeleteIds([]);
      setMessage(deletedIds.length === 1 ? "Archivo eliminado." : `${deletedIds.length} archivos eliminados.`);
    } catch (cause) {
      setError(filesFailure(cause, "No se pudieron eliminar los archivos.", "delete"));
    } finally {
      setBusy(false);
    }
  }, [busy, pendingDeleteIds]);

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!pendingDeleteIds.length && !renaming && !preview && !selectionMode) return;
        event.preventDefault();
        closeTransient();
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [closeTransient, pendingDeleteIds.length, preview, renaming, selectionMode]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const created = await uploadSavedFile(file);
      setFiles((current) => [created, ...current]);
      setMessage("Archivo respaldado.");
    } catch (cause) {
      setError(filesFailure(cause, "No se pudo subir el archivo.", "upload"));
    } finally {
      setUploading(false);
    }
  }

  async function toggleArchive(file: SavedFile) {
    const status = file.status === "archivado" ? "activo" : "archivado";
    setError(null);
    try {
      await updateSavedFile(file.id, { status });
      setFiles((current) => current.map((item) => item.id === file.id ? { ...item, status } : item));
    } catch (cause) {
      setError(filesFailure(cause, "No se pudo actualizar el archivo.", "archive"));
    }
  }

  function startRename(file: SavedFile) { setRenaming(file); setRenameValue(file.name); }
  function toggleSelected(id: string) { setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleSelectionMode() { setSelectionMode((current) => !current); setSelectedIds(new Set()); }
  function toggleAllVisible() { setSelectedIds(allVisibleSelected ? new Set() : new Set(filteredFiles.map((file) => file.id))); }

  const retryLoad = useCallback(async () => {
    setError(null);
    setLoading(true);
    await refresh();
  }, [refresh]);

  return {
    files, filteredFiles, origins, query, setQuery, origin, setOrigin, statusFilter, setStatusFilter,
    sort, setSort, view, setView, loading, uploading, busy, message, setMessage, error, setError,
    preview, setPreview, renaming, setRenaming, renameValue, setRenameValue,
    selectionMode, selectedIds, allVisibleSelected, pendingDeleteFiles, setPendingDeleteIds,
    upload, toggleArchive, startRename, toggleSelected, toggleSelectionMode, toggleAllVisible, retryLoad,
    closeTransient, saveRename, confirmDelete,
  };
}

export type FilesLibraryController = ReturnType<typeof useFilesLibrary>;
