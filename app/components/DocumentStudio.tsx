"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, Sparkles, X } from "@/app/components/Icons";
import { AiStudio } from "@/app/components/AiStudio";
import { DocumentCommandActions, DocumentSaveError } from "@/app/features/documents/DocumentCommandBar";
import { DocumentEditor } from "@/app/features/documents/DocumentEditor";
import { DocumentLibrary } from "@/app/features/documents/DocumentLibrary";
import { PatientEditor } from "@/app/features/documents/PatientEditor";
import { ProfessionalEditor } from "@/app/features/documents/ProfessionalEditor";
import { SignatureEditor } from "@/app/features/documents/SignatureEditor";
import { DocumentPreview } from "@/app/features/documents/DocumentPreview";
import { DocumentHistoryDialog } from "@/app/features/documents/DocumentHistoryDialog";
import { useDocumentWorkspace } from "@/app/features/documents/use-document-workspace";
import { useDocumentKeyboard } from "@/app/features/documents/use-document-keyboard";

export function DocumentStudio() {
  const workspace = useDocumentWorkspace();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantActivated, setAssistantActivated] = useState(false);
  const [signaturePanelOpen, setSignaturePanelOpen] = useState(false);
  const [professionalSlot, setProfessionalSlot] = useState<HTMLElement | null>(null);
  const { closeDocumentHistory, openDocument, persist, setMobileView, setNewMenuOpen, setSignatureDeleteId, setSignatureFormOpen } = workspace;
  const saveFromKeyboard = useCallback(() => void persist(), [persist]);
  const openNewDocumentMenu = useCallback(() => setNewMenuOpen(true), [setNewMenuOpen]);
  const closeSignaturePanel = useCallback(() => {
    setSignaturePanelOpen(false);
    setSignatureDeleteId(null);
    setSignatureFormOpen(false);
  }, [setSignatureDeleteId, setSignatureFormOpen]);
  const toggleSignaturePanel = useCallback(() => {
    if (signaturePanelOpen) {
      closeSignaturePanel();
      return;
    }
    setSignaturePanelOpen(true);
  }, [closeSignaturePanel, signaturePanelOpen]);
  const closeTransientControls = useCallback(() => {
    setNewMenuOpen(false);
    closeDocumentHistory();
    closeSignaturePanel();
  }, [closeDocumentHistory, closeSignaturePanel, setNewMenuOpen]);
  useDocumentKeyboard({
    saving: workspace.saving,
    onSave: saveFromKeyboard,
    onNewDocument: openNewDocumentMenu,
    onEscape: closeTransientControls,
  });

  const setAssistantVisibility = useCallback((open: boolean, updateUrl = true) => {
    if (open) setAssistantActivated(true);
    if (open) closeSignaturePanel();
    setAssistantOpen(open);
    if (!updateUrl) return;
    const url = new URL(window.location.href);
    if (open) url.searchParams.set("assistant", "1");
    else url.searchParams.delete("assistant");
    window.history.pushState({}, "", `${url.pathname}${url.search}`);
  }, [closeSignaturePanel]);

  const openGeneratedDocument = useCallback(async (id: string) => {
    if (!(await openDocument(id))) return;
    setAssistantVisibility(false, false);
    const url = new URL(window.location.href);
    url.searchParams.set("document", id);
    url.searchParams.delete("assistant");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [openDocument, setAssistantVisibility]);

  const editFromPreview = useCallback((fieldId: string) => {
    const compactViewport = window.matchMedia("(max-width: 820px)").matches;
    if (compactViewport) setMobileView("edit");
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const resolvedFieldId = compactViewport && fieldId.startsWith("professional-")
        ? `mobile-${fieldId}`
        : fieldId;
      const field = document.getElementById(resolvedFieldId);
      if (!(field instanceof HTMLElement)) return;
      field.focus();
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    }));
  }, [setMobileView]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setProfessionalSlot(document.getElementById("document-professional-slot"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
    <>
      {professionalSlot ? createPortal(
        <ProfessionalEditor
          signer={workspace.signer}
          updateSigner={workspace.updateSigner}
          variant="sidebar"
          onToggleSignature={toggleSignaturePanel}
          signatureOpen={signaturePanelOpen}
        />,
        professionalSlot,
      ) : null}
      {signaturePanelOpen ? (
        <aside id="signature-settings-panel" className="signature-settings-panel print-hide" aria-label="Configurar firma y timbre">
          <SignatureEditor workspace={workspace} onClose={closeSignaturePanel} />
        </aside>
      ) : null}
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
              <button className="button primary studio-print-button" onClick={() => window.print()}><Printer size={16} /> Imprimir</button>
              <DocumentCommandActions {...workspace} />
            </> : null}
          </div>
        </header>

        {workspace.loadError ? <p className="form-error standalone">{workspace.loadError}</p> : null}
        <DocumentSaveError saveError={workspace.saveError} reloadDocument={workspace.reloadDocument} />

        {assistantActivated ? (
          <div hidden={!assistantOpen}>
            <AiStudio active={assistantOpen} embedded onOpenDocument={openGeneratedDocument} />
          </div>
        ) : null}
        <div hidden={assistantOpen}>
          <div className="document-workspace-shell">
            <DocumentLibrary {...workspace} />
            <main className="document-main">
              <PatientEditor {...workspace} />
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
                <DocumentEditor
                  workspace={workspace}
                  onToggleSignature={toggleSignaturePanel}
                  signatureOpen={signaturePanelOpen}
                />
                <DocumentPreview {...workspace} onEditRequest={editFromPreview} />
              </div>
            </main>
          </div>
        </div>
        {workspace.historyOpen ? <DocumentHistoryDialog {...workspace} /> : null}
      </div>
    </>
  );
}
