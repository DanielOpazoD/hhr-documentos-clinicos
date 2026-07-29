"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { FilePlus2, FileText, Search, Trash2 } from "@/app/components/Icons";
import { documentTemplates } from "@/app/lib/catalog";
import { formatUpdated } from "./formatters";
import { ProfessionalEditor } from "./ProfessionalEditor";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "documentId"
  | "deletingDocumentIds"
  | "filteredDocuments"
  | "newMenuOpen"
  | "recentQuery"
  | "saving"
  | "signer"
  | "setNewMenuOpen"
  | "setRecentQuery"
  | "storedDocuments"
  | "updateSigner"
  | "createDocument"
  | "deleteDocument"
  | "deleteDocuments"
  | "openDocument"
>;

export function DocumentLibrary({
  documentId,
  deletingDocumentIds,
  filteredDocuments,
  newMenuOpen,
  recentQuery,
  saving,
  signer,
  setNewMenuOpen,
  setRecentQuery,
  storedDocuments,
  updateSigner,
  createDocument,
  deleteDocument,
  deleteDocuments,
  openDocument,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);

  useLayoutEffect(() => {
    const media = window.matchMedia("(max-width: 520px)");
    const updateViewport = () => setIsCompactViewport(media.matches);
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!confirmDeleteId && !confirmBulkDelete && !selectionMode) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirmDeleteId) setConfirmDeleteId(null);
      else if (confirmBulkDelete) setConfirmBulkDelete(false);
      else {
        setSelectionMode(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [confirmBulkDelete, confirmDeleteId, selectionMode]);

  const allSelected = filteredDocuments.length > 0 && filteredDocuments.every((document) => selectedIds.has(document.id));
  const libraryExpanded = !isCompactViewport || mobileLibraryOpen || newMenuOpen;
  const toggleSelection = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setConfirmBulkDelete(false);
    return next;
  });

  return (
    <aside className="document-library print-hide">
      <div className="document-library-mobile-actions">
        <button className="button primary full" disabled={saving} onClick={() => {
          setMobileLibraryOpen(true);
          setNewMenuOpen(!newMenuOpen);
        }} aria-keyshortcuts="Control+N Meta+N">
          <FilePlus2 size={17} /> Nuevo documento
        </button>
        <button
          className="button secondary document-library-toggle"
          type="button"
          aria-expanded={libraryExpanded}
          aria-controls="document-library-content"
          onClick={() => {
            setNewMenuOpen(false);
            setMobileLibraryOpen(!libraryExpanded);
          }}
        >
          Recientes <span>{storedDocuments.length}</span>
        </button>
      </div>

      <div id="document-library-content" className="document-library-content" hidden={!libraryExpanded}>
        {newMenuOpen ? (
          <div className="template-menu" aria-label="Tipo de documento">
            {documentTemplates.map((item) => (
              <button key={item.id} disabled={saving} onClick={() => {
                setNewMenuOpen(false);
                setMobileLibraryOpen(false);
                void createDocument(item.id);
              }}>
                <FileText size={16} />
                <span><strong>{item.name}</strong><small>{item.description}</small></span>
              </button>
            ))}
          </div>
        ) : null}

        <ProfessionalEditor signer={signer} updateSigner={updateSigner} />

        <div className="recent-heading">
          <div><strong>Recientes</strong><span>{storedDocuments.length}</span></div>
          {storedDocuments.length ? (
            <button className="text-button" onClick={() => {
              setSelectionMode((current) => !current);
              setSelectedIds(new Set());
              setConfirmBulkDelete(false);
            }}>{selectionMode ? "Cancelar" : "Seleccionar"}</button>
          ) : null}
        </div>

        {storedDocuments.length ? (
          <>
          <label className="recent-search">
            <Search size={14} />
            <input
              aria-label="Buscar documentos recientes"
              value={recentQuery}
              onChange={(event) => {
                setRecentQuery(event.target.value);
                if (selectionMode) {
                  setSelectedIds(new Set());
                  setConfirmBulkDelete(false);
                }
              }}
              placeholder="Buscar…"
            />
          </label>
          {selectionMode ? (
            <div className="document-selection-bar">
              <label>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => {
                    setSelectedIds(allSelected ? new Set() : new Set(filteredDocuments.map((document) => document.id)));
                    setConfirmBulkDelete(false);
                  }}
                />
                Todos visibles
              </label>
              <span>{selectedIds.size} seleccionados</span>
              <button
                disabled={!selectedIds.size || deletingDocumentIds.size > 0}
                className={confirmBulkDelete ? "confirm" : ""}
                onClick={() => {
                  if (!confirmBulkDelete) return setConfirmBulkDelete(true);
                  const ids = [...selectedIds];
                  setConfirmBulkDelete(false);
                  void deleteDocuments(ids).then((deleted) => {
                    if (!deleted) return;
                    setSelectedIds(new Set());
                    setSelectionMode(false);
                  });
                }}
              >
                <Trash2 size={12} /> {confirmBulkDelete ? `Confirmar (${selectedIds.size})` : "Eliminar"}
              </button>
            </div>
          ) : null}
          <div className="recent-document-list">
            {filteredDocuments.map((item) => {
              const confirming = confirmDeleteId === item.id;
              const deleting = deletingDocumentIds.has(item.id);
              const selected = selectedIds.has(item.id);
              return (
                <div className={`${item.id === documentId ? "active " : ""}${confirming ? "delete-pending " : ""}${selectionMode ? "selecting " : ""}${selected ? "selected" : ""}`} key={item.id}>
                  {selectionMode ? <input className="recent-document-checkbox" type="checkbox" aria-label={`Seleccionar ${item.title}`} checked={selected} onChange={() => toggleSelection(item.id)} /> : null}
                  <button className="recent-document-open" disabled={saving || deleting} onClick={() => {
                    if (selectionMode) return toggleSelection(item.id);
                    setNewMenuOpen(false);
                    setMobileLibraryOpen(false);
                    void openDocument(item.id);
                  }}>
                    <span><strong>{item.title}</strong>{item.patientName ? <small>{item.patientName}</small> : null}</span>
                    <span><em>{item.status}</em><small>{formatUpdated(item.updatedAt)}</small></span>
                  </button>
                  {!selectionMode ? <button
                    className="recent-document-delete"
                    disabled={saving || deleting}
                    aria-label={confirming ? `Confirmar eliminación de ${item.title}` : `Eliminar ${item.title}`}
                    title={confirming ? "Confirmar eliminación" : "Eliminar"}
                    onClick={() => {
                      if (!confirming) return setConfirmDeleteId(item.id);
                      setConfirmDeleteId(null);
                      void deleteDocument(item.id);
                    }}
                  >
                    <Trash2 size={13} />{confirming ? <span>Eliminar</span> : null}
                  </button> : null}
                </div>
              );
            })}
          </div>
          </>
        ) : (
          <p className="empty-recent">Los documentos guardados aparecerán aquí.</p>
        )}
      </div>
    </aside>
  );
}
