"use client";

import { useEffect, useState } from "react";
import { FilePlus2, FileText, Search, Sparkles, Trash2 } from "@/app/components/Icons";
import { EmptyState } from "@/app/components/VisualPrimitives";
import { documentTemplates } from "@/app/lib/catalog";
import { createPromptProfile, proposePromptProfileFromDocuments } from "@/app/features/ai/prompt-client";
import type { AiPromptInput, AiPromptProposal } from "@/app/features/ai/prompt-types";
import { formatUpdated } from "./formatters";
import { PromptProposalDialog } from "./PromptProposalDialog";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "documentId"
  | "deletingDocumentIds"
  | "filteredDocuments"
  | "newMenuOpen"
  | "recentQuery"
  | "saving"
  | "setNewMenuOpen"
  | "setRecentQuery"
  | "storedDocuments"
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
  setNewMenuOpen,
  setRecentQuery,
  storedDocuments,
  createDocument,
  deleteDocument,
  deleteDocuments,
  openDocument,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmPromptCreation, setConfirmPromptCreation] = useState(false);
  const [promptBusy, setPromptBusy] = useState(false);
  const [promptProposal, setPromptProposal] = useState<AiPromptProposal | null>(null);
  const [promptSaveError, setPromptSaveError] = useState<string | null>(null);
  const [promptFeedback, setPromptFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);

  useEffect(() => {
    if (!confirmDeleteId && !confirmBulkDelete && !confirmPromptCreation && !selectionMode && !mobileLibraryOpen && !newMenuOpen) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (confirmDeleteId) setConfirmDeleteId(null);
      else if (confirmBulkDelete) setConfirmBulkDelete(false);
      else if (confirmPromptCreation) setConfirmPromptCreation(false);
      else {
        setSelectionMode(false);
        setSelectedIds(new Set());
        setMobileLibraryOpen(false);
        setNewMenuOpen(false);
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [confirmBulkDelete, confirmDeleteId, confirmPromptCreation, mobileLibraryOpen, newMenuOpen, selectionMode, setNewMenuOpen]);

  const allSelected = filteredDocuments.length > 0 && filteredDocuments.every((document) => selectedIds.has(document.id));
  const libraryExpanded = mobileLibraryOpen || newMenuOpen;
  const toggleSelection = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setConfirmBulkDelete(false);
    setConfirmPromptCreation(false);
    return next;
  });

  async function createPromptFromSelection() {
    if (!selectedIds.size || promptBusy) return;
    if (!confirmPromptCreation) {
      setConfirmBulkDelete(false);
      setConfirmPromptCreation(true);
      setPromptFeedback(null);
      return;
    }
    setPromptBusy(true);
    setPromptFeedback(null);
    try {
      const proposal = await proposePromptProfileFromDocuments([...selectedIds]);
      setPromptProposal(proposal);
      setPromptSaveError(null);
    } catch (cause) {
      setPromptFeedback({ kind: "error", text: cause instanceof Error ? cause.message : "No se pudo crear la plantilla." });
    } finally {
      setPromptBusy(false);
      setConfirmPromptCreation(false);
    }
  }

  async function savePromptProposal(input: AiPromptInput) {
    if (promptBusy) return;
    setPromptBusy(true);
    setPromptSaveError(null);
    try {
      const result = await createPromptProfile(input);
      if (!result.prompt) throw new Error("No se pudo recuperar la plantilla guardada.");
      window.dispatchEvent(new CustomEvent("hhr:ai-prompts-changed"));
      setPromptFeedback({ kind: "success", text: `Plantilla «${result.prompt.name}» guardada en Mis plantillas.` });
      setPromptProposal(null);
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch (cause) {
      setPromptSaveError(cause instanceof Error ? cause.message : "No se pudo guardar la plantilla.");
    } finally {
      setPromptBusy(false);
    }
  }

  return (
    <aside className="document-library print-hide">
      {promptProposal ? <PromptProposalDialog proposal={promptProposal} busy={promptBusy} error={promptSaveError} onClose={() => { setPromptProposal(null); setPromptSaveError(null); }} onSave={(input) => void savePromptProposal(input)} /> : null}
      <div className="document-library-mobile-actions">
        <button className="button secondary full document-new-button" disabled={saving} onClick={() => {
          const nextOpen = !newMenuOpen;
          setMobileLibraryOpen(nextOpen);
          setNewMenuOpen(nextOpen);
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

        <div className="recent-heading">
          <div><strong>Recientes</strong><span>{storedDocuments.length}</span></div>
          {storedDocuments.length ? (
            <button className="text-button" onClick={() => {
              setSelectionMode((current) => !current);
              setSelectedIds(new Set());
              setConfirmBulkDelete(false);
              setConfirmPromptCreation(false);
            }}>{selectionMode ? "Cancelar" : "Seleccionar"}</button>
          ) : null}
        </div>
        {promptFeedback ? <p className={`document-library-feedback ${promptFeedback.kind}`} role={promptFeedback.kind === "error" ? "alert" : "status"}>{promptFeedback.text}</p> : null}

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
                  setConfirmPromptCreation(false);
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
                    setConfirmPromptCreation(false);
                  }}
                />
                Todos visibles
              </label>
              <span>{selectedIds.size} seleccionados</span>
              <button
                disabled={!selectedIds.size || promptBusy || deletingDocumentIds.size > 0}
                className={confirmPromptCreation ? "confirm-ai" : "create-ai"}
                title="OpenAI recibirá sólo la estructura anonimizada de los documentos, nunca su texto clínico, para proponer una plantilla reutilizable."
                onClick={() => void createPromptFromSelection()}
              >
                <Sparkles size={12} /> {promptBusy ? "Creando…" : confirmPromptCreation ? `Confirmar con IA (${selectedIds.size})` : "Crear plantilla IA"}
              </button>
              <button
                disabled={!selectedIds.size || deletingDocumentIds.size > 0}
                className={confirmBulkDelete ? "confirm" : ""}
                onClick={() => {
                  if (!confirmBulkDelete) {
                    setConfirmPromptCreation(false);
                    return setConfirmBulkDelete(true);
                  }
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
          <EmptyState compact className="empty-recent" title="Sin documentos guardados" description="Los documentos que guarde aparecerán aquí." />
        )}
      </div>
    </aside>
  );
}
