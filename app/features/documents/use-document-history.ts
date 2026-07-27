"use client";

import { useCallback, useRef, useState } from "react";
import { listDocumentVersions, restoreDocumentVersion } from "./api";
import type { StoredDocumentVersion } from "./types";

export function useDocumentHistory({
  documentId,
  documentUpdatedAtRef,
  flushPendingSave,
  openDocument,
}: {
  documentId: string | null;
  documentUpdatedAtRef: { current: string | null };
  flushPendingSave: () => Promise<boolean>;
  openDocument: (id: string) => Promise<void>;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [documentVersions, setDocumentVersions] = useState<StoredDocumentVersion[]>([]);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [historyDocumentId, setHistoryDocumentId] = useState<string | null>(null);
  const historyRequest = useRef(0);
  const restoreRequestActive = useRef(false);

  const closeDocumentHistory = useCallback(() => {
    if (restoreRequestActive.current) return;
    setHistoryOpen(false);
  }, []);

  const openDocumentHistory = useCallback(async () => {
    if (!documentId) return;
    const requestId = historyRequest.current + 1;
    historyRequest.current = requestId;
    setHistoryDocumentId(documentId);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    setDocumentVersions([]);
    try {
      const versions = await listDocumentVersions(documentId);
      if (historyRequest.current === requestId) setDocumentVersions(versions);
    } catch (error) {
      if (historyRequest.current === requestId) {
        setHistoryError(error instanceof Error ? error.message : "No se pudo cargar el historial.");
      }
    } finally {
      if (historyRequest.current === requestId) setHistoryLoading(false);
    }
  }, [documentId]);

  const restoreVersion = useCallback(async (requestedVersion: number) => {
    if (!documentId || historyDocumentId !== documentId || historyLoading || restoreRequestActive.current) return false;
    restoreRequestActive.current = true;
    setRestoringVersion(requestedVersion);
    setHistoryError(null);
    try {
      if (!(await flushPendingSave())) {
        setHistoryError("Hay cambios que no pudieron guardarse. Cierre el historial y recargue el documento.");
        return false;
      }
      const expectedUpdatedAt = documentUpdatedAtRef.current;
      if (!expectedUpdatedAt) {
        setHistoryError("Vuelva a abrir el documento antes de restaurar.");
        return false;
      }
      await restoreDocumentVersion(documentId, requestedVersion, expectedUpdatedAt);
      await openDocument(documentId);
      setHistoryOpen(false);
      return true;
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "No se pudo restaurar la versión.");
      return false;
    } finally {
      restoreRequestActive.current = false;
      setRestoringVersion(null);
    }
  }, [documentId, documentUpdatedAtRef, flushPendingSave, historyDocumentId, historyLoading, openDocument]);

  return {
    historyOpen,
    setHistoryOpen,
    closeDocumentHistory,
    historyLoading,
    historyError,
    documentVersions,
    restoringVersion,
    openDocumentHistory,
    restoreVersion,
  };
}
