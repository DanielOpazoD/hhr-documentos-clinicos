"use client";

import { useCallback } from "react";
import { Download, Printer } from "@/app/components/Icons";
import { DocumentCommandBar } from "@/app/features/documents/DocumentCommandBar";
import { DocumentEditor } from "@/app/features/documents/DocumentEditor";
import { DocumentLibrary } from "@/app/features/documents/DocumentLibrary";
import { DocumentPreview } from "@/app/features/documents/DocumentPreview";
import { useDocumentWorkspace } from "@/app/features/documents/use-document-workspace";
import { useDocumentKeyboard } from "@/app/features/documents/use-document-keyboard";

export function DocumentStudio() {
  const workspace = useDocumentWorkspace();
  const { persist, setNewMenuOpen, setSignatureDeleteId, setSignatureFormOpen } = workspace;
  const saveFromKeyboard = useCallback(() => void persist(), [persist]);
  const openNewDocumentMenu = useCallback(() => setNewMenuOpen(true), [setNewMenuOpen]);
  const closeTransientControls = useCallback(() => {
    setNewMenuOpen(false);
    setSignatureDeleteId(null);
    setSignatureFormOpen(false);
  }, [setNewMenuOpen, setSignatureDeleteId, setSignatureFormOpen]);
  useDocumentKeyboard({
    saving: workspace.saving,
    onSave: saveFromKeyboard,
    onNewDocument: openNewDocumentMenu,
    onEscape: closeTransientControls,
  });

  return (
    <div className="page-wrap studio-page simplified-studio">
      <header className="page-header compact-page-header">
        <div><h1>Documentos</h1></div>
        <div className="header-actions">
          <button className="button secondary" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
          <button className="button primary" onClick={() => void workspace.downloadPdf()}><Download size={16} /> Descargar PDF</button>
        </div>
      </header>

      {workspace.loadError ? <p className="form-error standalone">{workspace.loadError}</p> : null}

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
  );
}
