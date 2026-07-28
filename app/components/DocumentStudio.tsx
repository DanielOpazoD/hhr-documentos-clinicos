"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Printer, Sparkles, X } from "@/app/components/Icons";
import { AiStudio } from "@/app/components/AiStudio";
import { DocumentCommandBar } from "@/app/features/documents/DocumentCommandBar";
import { DocumentEditor } from "@/app/features/documents/DocumentEditor";
import { DocumentLibrary } from "@/app/features/documents/DocumentLibrary";
import { DocumentPreview } from "@/app/features/documents/DocumentPreview";
import { DocumentHistoryDialog } from "@/app/features/documents/DocumentHistoryDialog";
import { useDocumentWorkspace } from "@/app/features/documents/use-document-workspace";
import { useDocumentKeyboard } from "@/app/features/documents/use-document-keyboard";

export function DocumentStudio() {
  const workspace = useDocumentWorkspace();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantActivated, setAssistantActivated] = useState(false);
  const { closeDocumentHistory, openDocument, persist, setNewMenuOpen, setSignatureDeleteId, setSignatureFormOpen } = workspace;
  const saveFromKeyboard = useCallback(() => void persist(), [persist]);
  const openNewDocumentMenu = useCallback(() => setNewMenuOpen(true), [setNewMenuOpen]);
  const closeTransientControls = useCallback(() => {
    setNewMenuOpen(false);
    closeDocumentHistory();
    setSignatureDeleteId(null);
    setSignatureFormOpen(false);
  }, [closeDocumentHistory, setNewMenuOpen, setSignatureDeleteId, setSignatureFormOpen]);
  useDocumentKeyboard({
    saving: workspace.saving,
    onSave: saveFromKeyboard,
    onNewDocument: openNewDocumentMenu,
    onEscape: closeTransientControls,
  });

  const setAssistantVisibility = useCallback((open: boolean, updateUrl = true) => {
    if (open) setAssistantActivated(true);
    setAssistantOpen(open);
    if (!updateUrl) return;
    const url = new URL(window.location.href);
    if (open) url.searchParams.set("assistant", "1");
    else url.searchParams.delete("assistant");
    window.history.pushState({}, "", `${url.pathname}${url.search}`);
  }, []);

  const openGeneratedDocument = useCallback(async (id: string) => {
    if (!(await openDocument(id))) return;
    setAssistantVisibility(false, false);
    const url = new URL(window.location.href);
    url.searchParams.set("document", id);
    url.searchParams.delete("assistant");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [openDocument, setAssistantVisibility]);

  useEffect(() => {
    const syncAssistantFromUrl = () => {
      const open = new URLSearchParams(window.location.search).get("assistant") === "1";
      if (open) setAssistantActivated(true);
      setAssistantOpen(open);
    };
    syncAssistantFromUrl();
    window.addEventListener("popstate", syncAssistantFromUrl);
    return () => window.removeEventListener("popstate", syncAssistantFromUrl);
  }, []);

  return (
    <div className="page-wrap studio-page simplified-studio">
      <header className="page-header compact-page-header">
        <div className="document-page-title">
          <h1>Documentos</h1>
          <p>Redacte manualmente o genere un borrador con IA.</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className={assistantOpen ? "button secondary document-assistant-toggle active" : "button secondary document-assistant-toggle"}
            aria-expanded={assistantOpen}
            aria-controls="document-ai-assistant"
            onClick={() => setAssistantVisibility(!assistantOpen)}
          >
            {assistantOpen ? <X size={16} /> : <Sparkles size={16} />}
            {assistantOpen ? "Volver al editor" : "Usar IA"}
          </button>
          {!assistantOpen ? <>
            <button className="button secondary studio-print-button" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
            <button className="button primary studio-download-button" aria-label="Descargar PDF" onClick={() => void workspace.downloadPdf()}>
              <Download size={16} />
              <span className="desktop-action-label">Descargar PDF</span>
              <span className="mobile-action-label" aria-hidden="true">PDF</span>
            </button>
          </> : null}
        </div>
      </header>

      {workspace.loadError ? <p className="form-error standalone">{workspace.loadError}</p> : null}

      {assistantActivated ? (
        <div hidden={!assistantOpen}>
          <AiStudio active={assistantOpen} embedded onOpenDocument={openGeneratedDocument} />
        </div>
      ) : null}
      <div hidden={assistantOpen}>
        <div className="document-workspace-shell">
          <DocumentLibrary {...workspace} />
          <main className="document-main">
            <DocumentCommandBar {...workspace} />
            <div className="studio-view-switch print-hide" role="tablist" aria-label="Vista del documento">
              <button
                role="tab"
                aria-selected={workspace.mobileView === "edit"}
                aria-controls="document-editor"
                onClick={() => workspace.setMobileView("edit")}
              >
                Editar
              </button>
              <button
                role="tab"
                aria-selected={workspace.mobileView === "preview"}
                aria-controls="document-preview"
                onClick={() => workspace.setMobileView("preview")}
              >
                Vista previa
              </button>
            </div>
            <div className="editor-layout document-editor-layout">
              <DocumentEditor workspace={workspace} />
              <DocumentPreview {...workspace} />
            </div>
          </main>
        </div>
      </div>
      {workspace.historyOpen ? <DocumentHistoryDialog {...workspace} /> : null}
    </div>
  );
}
