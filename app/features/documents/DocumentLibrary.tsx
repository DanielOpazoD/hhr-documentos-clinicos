"use client";

import { useEffect, useState } from "react";
import { FilePlus2, FileText, Search, Trash2 } from "@/app/components/Icons";
import { documentTemplates } from "@/app/lib/catalog";
import { formatUpdated } from "./formatters";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "documentId"
  | "deletingDocumentId"
  | "filteredDocuments"
  | "newMenuOpen"
  | "recentQuery"
  | "saving"
  | "setNewMenuOpen"
  | "setRecentQuery"
  | "storedDocuments"
  | "createDocument"
  | "deleteDocument"
  | "openDocument"
>;

export function DocumentLibrary({
  documentId,
  deletingDocumentId,
  filteredDocuments,
  newMenuOpen,
  recentQuery,
  saving,
  setNewMenuOpen,
  setRecentQuery,
  storedDocuments,
  createDocument,
  deleteDocument,
  openDocument,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmDeleteId(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [confirmDeleteId]);

  return (
    <aside className="document-library print-hide">
      <button className="button primary full" disabled={saving} onClick={() => setNewMenuOpen(!newMenuOpen)} aria-keyshortcuts="Control+N Meta+N">
        <FilePlus2 size={17} /> Nuevo documento
      </button>

      {newMenuOpen ? (
        <div className="template-menu" aria-label="Tipo de documento">
          {documentTemplates.map((item) => (
            <button key={item.id} disabled={saving} onClick={() => void createDocument(item.id)}>
              <FileText size={16} />
              <span><strong>{item.name}</strong><small>{item.description}</small></span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="recent-heading">
        <strong>Recientes</strong>
        <span>{storedDocuments.length}</span>
      </div>

      {storedDocuments.length ? (
        <>
          <label className="recent-search">
            <Search size={14} />
            <input
              aria-label="Buscar documentos recientes"
              value={recentQuery}
              onChange={(event) => setRecentQuery(event.target.value)}
              placeholder="Buscar…"
            />
          </label>
          <div className="recent-document-list">
            {filteredDocuments.map((item) => {
              const confirming = confirmDeleteId === item.id;
              const deleting = deletingDocumentId === item.id;
              return (
                <div className={`${item.id === documentId ? "active " : ""}${confirming ? "delete-pending" : ""}`} key={item.id}>
                  <button className="recent-document-open" disabled={saving || deleting} onClick={() => void openDocument(item.id)}>
                    <span><strong>{item.title}</strong>{item.patientName ? <small>{item.patientName}</small> : null}</span>
                    <span><em>{item.status}</em><small>{formatUpdated(item.updatedAt)}</small></span>
                  </button>
                  <button
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
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="empty-recent">Los documentos guardados aparecerán aquí.</p>
      )}
    </aside>
  );
}
